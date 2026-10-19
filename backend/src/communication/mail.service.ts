import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { renderEmail } from './email-render';
import { EmailTemplatesService } from './email-templates.service';
import { Email, EmailStatus } from './schemas/email.schema';

export interface OutgoingMail {
  to: string;
  template: string;
  vars: Record<string, string | undefined>;
  toName?: string;
  userId?: string;
  related?: { type?: string; id?: string };
  /** Hold the email until this time (scheduled send). */
  sendAt?: Date;
  /** Send even if the template is switched off (an Admin's own test). */
  ignoreEnabled?: boolean;
}

/**
 * The only way the app sends email. It renders the template and writes a QUEUED row; the EmailWorker delivers it
 * asynchronously, so a slow or failing provider never blocks a request (spec §67).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    @InjectModel(Email.name) private readonly emails: Model<Email>,
    private readonly templates: EmailTemplatesService,
  ) {}

  async send(mail: OutgoingMail): Promise<string | null> {
    try {
      const tpl = await this.templates.get(mail.template);
      if (!tpl) { this.logger.warn(`Unknown email template "${mail.template}"`); return null; }
      if (!tpl.enabled && !mail.ignoreEnabled) return null;
      const vars = { name: mail.toName, ...mail.vars };
      const { subject, html, text } = renderEmail(tpl, vars);
      const doc = await this.emails.create({
        to: mail.to, toName: mail.toName, userId: mail.userId, template: mail.template, subject, html, text,
        status: EmailStatus.QUEUED, nextAttemptAt: mail.sendAt ?? new Date(), related: mail.related,
        bodyRedacted: false, events: [{ status: EmailStatus.QUEUED, at: new Date() }],
      });
      return doc.id;
    } catch (err) {
      // Email problems must never break the action that triggered them.
      this.logger.error(`Could not queue "${mail.template}" to ${mail.to}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
