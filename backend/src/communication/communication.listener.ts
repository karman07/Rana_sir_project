import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Role, UserStatus } from '@rms/shared';
import type { Model } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { Company } from '../companies/schemas/company.schema';
import type { DomainEventPayload } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import { MailService } from './mail.service';
import { RULES, type Person, type RuleContext } from './notification-rules';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';

/**
 * Turns domain events into in-app notifications and queued emails (spec §90).
 * Failures are logged per delivery; they never affect the action that raised the event.
 */
@Injectable()
export class CommunicationListener implements OnModuleInit {
  private readonly logger = new Logger(CommunicationListener.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly settings: NotificationSettingsService,
    private readonly config: ConfigService<Env, true>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Application.name) private readonly applications: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
  ) {}

  onModuleInit() {
    this.emitter.onAny(async (event: string | string[], payload: DomainEventPayload) => {
      const name = String(event);
      const rule = RULES[name];
      if (!rule || !payload?.entity) return;
      try {
        const deliveries = await rule(payload, this.context(), name);
        for (const d of deliveries) await this.deliver(name, payload, d);
      } catch (err) {
        this.logger.error(`Rule for ${name} failed: ${err instanceof Error ? err.message : err}`);
      }
    });
  }

  private absolute(path?: string) {
    if (!path) return undefined;
    return path.startsWith('http') ? path : `${this.config.get('WEB_ORIGIN')}${path}`;
  }

  private async deliver(event: string, payload: DomainEventPayload, d: import('./notification-rules').Delivery) {
    // Nobody is notified about their own action.
    if (payload.actor.id && payload.actor.id === d.to.id && event !== 'CANDIDATE_REGISTERED' && event !== 'RECRUITER_REGISTERED' && event !== 'PASSWORD_RESET' && event !== 'APPLICATION_CREATED') return;
    // Admin can switch an event's in-app and email notifications off independently.
    const channels = await this.settings.channels(event);
    if (!channels.inApp) delete d.notification;
    if (!channels.email) delete d.email;
    if (d.notification) {
      await this.notifications.create({ userId: d.to.id, ...d.notification, entityType: payload.entity.type, entityId: payload.entity.id, event }).catch((e) => this.logger.error(`Notification failed: ${e.message}`));
    }
    if (d.email) {
      await this.mail.send({
        to: d.to.email, toName: d.to.name, userId: d.to.id, template: d.email.template,
        vars: { ...d.email.vars, name: d.to.name, link: this.absolute(d.email.vars.link) }, related: { type: payload.entity.type, id: payload.entity.id },
      });
    }
  }

  private context(): RuleContext {
    const person = (u: any): Person | null => (u ? { id: String(u._id), name: u.name, email: u.email, role: u.role } : null);
    return {
      admins: async () => (await this.users.find({ role: Role.ADMIN, status: UserStatus.ACTIVE }).lean()).map((u) => person(u)!),
      user: async (id) => (id ? person(await this.users.findById(id).lean()) : null),
      company: async (id) => {
        const c = await this.companies.findById(id).lean();
        return c ? { id: String(c._id), name: c.name, createdBy: c.createdBy ? person(await this.users.findById(c.createdBy).lean()) : null } : null;
      },
      application: async (id) => {
        const a = await this.applications.findById(id).lean();
        if (!a) return null;
        const [candidate, recruiter, job, company] = await Promise.all([
          this.users.findById(a.candidateId).lean(), this.users.findById(a.recruiterId).lean(),
          this.jobs.findById(a.jobId).lean(), this.companies.findById(a.companyId).lean(),
        ]);
        return { id: String(a._id), number: a.applicationNumber, candidate: person(candidate), recruiter: person(recruiter), jobTitle: job?.spec?.title ?? 'the role', companyName: company?.name ?? '' };
      },
    };
  }
}
