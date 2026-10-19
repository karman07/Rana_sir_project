import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role, formatMoney } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import type { CommissionRule } from '../contracts/commission-calculation.service';
import { DEFAULT_COMMISSION } from '../contracts/contract-terms';
import { CommissionRuleDoc, RuleScope } from './schemas/commission-rule.schema';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';

export interface RuleInput { scope: RuleScope; refId?: string; type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number; currency?: string; note?: string }

const toRule = (r: Pick<CommissionRuleDoc, 'type' | 'basisPoints' | 'amount'>): CommissionRule =>
  r.type === 'FIXED' ? { type: 'FIXED', amount: r.amount ?? 0 } : { type: 'PERCENT', basisPoints: r.basisPoints ?? 0 };

@Injectable()
export class CommissionRulesService {
  constructor(
    @InjectModel(CommissionRuleDoc.name) private readonly rules: Model<CommissionRuleDoc>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly events: EventBusService,
  ) {}

  /** The rule a new contract starts with: job, then recruiter, then global, then the built-in default. */
  async resolve(target: { recruiterId?: unknown; jobId?: unknown }): Promise<{ rule: CommissionRule; source: RuleScope | 'DEFAULT' }> {
    const pick = async (scope: RuleScope, refId?: unknown) =>
      this.rules.findOne({ scope, active: true, ...(scope === RuleScope.GLOBAL ? {} : { refId: new Types.ObjectId(String(refId)) }) }).sort({ createdAt: -1 }).lean();
    const hit =
      (target.jobId ? await pick(RuleScope.JOB, target.jobId) : null) ??
      (target.recruiterId ? await pick(RuleScope.RECRUITER, target.recruiterId) : null);
    if (hit) return { rule: toRule(hit), source: hit.scope };
    const global = await pick(RuleScope.GLOBAL);
    return global ? { rule: toRule(global), source: RuleScope.GLOBAL } : { rule: DEFAULT_COMMISSION, source: 'DEFAULT' };
  }

  describe(r: Pick<CommissionRuleDoc, 'type' | 'basisPoints' | 'amount' | 'currency'>) {
    return r.type === 'PERCENT' ? `${((r.basisPoints ?? 0) / 100).toFixed((r.basisPoints ?? 0) % 100 ? 2 : 0)}%` : formatMoney({ amount: r.amount ?? 0, currency: r.currency ?? 'USD' });
  }

  async list() {
    const rows = await this.rules.find().sort({ active: -1, scope: 1, createdAt: -1 }).lean();
    return { items: rows.map((r) => this.present(r)), fallback: { type: 'PERCENT', basisPoints: DEFAULT_COMMISSION.type === 'PERCENT' ? DEFAULT_COMMISSION.basisPoints : 0, label: 'Built-in default' } };
  }

  private present(r: any) {
    return {
      id: String(r._id), scope: r.scope, refId: r.refId ? String(r.refId) : undefined, refLabel: r.refLabel, type: r.type, basisPoints: r.basisPoints, amount: r.amount, currency: r.currency,
      label: this.describe(r), active: r.active, note: r.note, createdAt: r.createdAt,
    };
  }

  async create(dto: RuleInput, admin: AuthUser) {
    if (dto.scope !== RuleScope.GLOBAL && !dto.refId) throw new BadRequestException('Choose the recruiter or job this rule is for');
    if (dto.type === 'PERCENT' && !(dto.percent !== undefined && dto.percent >= 0 && dto.percent <= 100)) throw new BadRequestException('Enter a percentage between 0 and 100');
    if (dto.type === 'FIXED' && (!dto.amount || !dto.currency)) throw new BadRequestException('A fixed commission needs an amount and a currency');

    let refLabel: string | undefined;
    if (dto.scope === RuleScope.RECRUITER) {
      const u = await this.users.findOne({ _id: dto.refId, role: Role.RECRUITER }).select('name').lean();
      if (!u) throw new NotFoundException('Recruiter not found');
      refLabel = u.name;
    } else if (dto.scope === RuleScope.JOB) {
      const j = await this.jobs.findById(dto.refId).select('jobNumber spec.title').lean();
      if (!j) throw new NotFoundException('Job not found');
      refLabel = `${j.jobNumber} · ${j.spec?.title ?? ''}`;
    }
    // One active rule per target: a new one replaces the old, which stays on record as inactive.
    const filter = { scope: dto.scope, active: true, ...(dto.refId ? { refId: new Types.ObjectId(dto.refId) } : { refId: { $exists: false } }) };
    const previous = await this.rules.findOneAndUpdate(filter as never, { active: false }, { returnDocument: 'before' });
    const doc = await this.rules.create({
      scope: dto.scope, refId: dto.refId ? new Types.ObjectId(dto.refId) : undefined, refLabel, type: dto.type,
      basisPoints: dto.type === 'PERCENT' ? Math.round(dto.percent! * 100) : undefined, amount: dto.type === 'FIXED' ? dto.amount : undefined, currency: dto.type === 'FIXED' ? dto.currency!.toUpperCase() : undefined,
      note: dto.note, createdBy: new Types.ObjectId(admin.id),
    });
    await this.events.publish(DomainEvent.COMMISSION_RULE_CHANGED, {
      actor: { id: admin.id, role: admin.role }, entity: { type: 'CommissionRule', id: doc.id },
      previousState: previous ? { rule: this.describe(previous), scope: previous.scope, target: previous.refLabel } : undefined, newState: { rule: this.describe(doc), scope: doc.scope, target: refLabel },
    });
    return this.present(doc.toObject());
  }

  async deactivate(id: string, admin: AuthUser) {
    const r = await this.rules.findOneAndUpdate({ _id: id, active: true }, { active: false }, { returnDocument: 'after' });
    if (!r) throw new NotFoundException('Rule not found, or already off');
    await this.events.publish(DomainEvent.COMMISSION_RULE_CHANGED, {
      actor: { id: admin.id, role: admin.role }, entity: { type: 'CommissionRule', id: r.id }, previousState: { rule: this.describe(r), scope: r.scope, target: r.refLabel }, newState: { active: false },
    });
    return this.present(r.toObject());
  }
}
