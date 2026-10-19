import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { CommissionRulesService } from '../commissions/commission-rules.service';
import { CommissionCalculationService, type CommissionRule } from '../contracts/commission-calculation.service';
import { Job } from './schemas/job.schema';

const calc = new CommissionCalculationService();
const RECEIVED = ['RECEIVED', 'PAYOUT_SENT', 'COMPLETED'];
const RELEASED = ['CLIENT_PAID'];

/**
 * What the company pays (the recruiter's figure) is not what the candidate sees: the platform's commission comes off it.
 * Only Admin ever sees the commission. Candidates and the public see the pay that is left, so the cut never shows.
 */
@Injectable()
export class JobPricingService {
  constructor(private readonly rules: CommissionRulesService, @InjectModel(Job.name) private readonly jobs: Model<Job>) {}

  /** A candidate's figure for one amount, the same arithmetic contracts and payments use. */
  private net(amount: number, basis: string | undefined, hoursPerWeek: number | undefined, rule: CommissionRule, currency: string) {
    if (rule.type === 'PERCENT') return Math.round(amount * (1 - rule.basisPoints / 10_000));
    if (basis === 'HOUR') return Math.round(amount * calc.candidateShare({ amount, period: 'HOUR', hoursPerWeek }, currency, rule));
    return calc.calculate(amount, rule).candidateAmount;
  }

  /** The compensation with the commission taken off, for candidates and the public. */
  async candidateCompensation(job: { _id?: unknown; id?: string; recruiterId?: unknown; spec?: any }) {
    const c = job.spec?.compensation;
    if (!c || (c.salaryMin === undefined && c.salaryMax === undefined)) return c;
    const { rule } = await this.rules.resolve({ recruiterId: job.recruiterId, jobId: job._id ?? job.id });
    const cur = c.currency ?? 'USD';
    const scale = (n?: number) => (n === undefined || n === null ? n : this.net(n, c.payBasis, c.hoursPerWeek, rule, cur));
    return { ...c, salaryMin: scale(c.salaryMin), salaryMax: scale(c.salaryMax) };
  }

  /** Admin's view: the rule in force for this opening and what the candidate would be shown. */
  async forAdmin(job: { _id?: unknown; recruiterId?: unknown; spec?: any } | undefined, recruiterId: unknown) {
    const { rule, source } = await this.rules.resolve({ recruiterId, jobId: job?._id });
    const sum = (statuses: string[]) => job?._id
      ? this.jobs.db.model('Payment').aggregate([
          { $match: { jobId: job._id, status: { $in: statuses } } },
          { $group: { _id: '$currency', commission: { $sum: '$commissionAmount' }, gross: { $sum: '$grossAmount' }, payments: { $sum: 1 } } },
        ])
      : Promise.resolve([] as any[]);
    const [earned, pending] = await Promise.all([sum(RECEIVED), sum(RELEASED)]);
    return {
      type: rule.type, percent: rule.type === 'PERCENT' ? rule.basisPoints / 100 : undefined, amount: rule.type === 'FIXED' ? rule.amount : undefined,
      label: this.rules.describe({ type: rule.type, basisPoints: rule.type === 'PERCENT' ? rule.basisPoints : undefined, amount: rule.type === 'FIXED' ? rule.amount : undefined, currency: job?.spec?.compensation?.currency }),
      source, candidateCompensation: job?.spec ? await this.candidateCompensation({ ...job, spec: job.spec }) : undefined,
      earned: earned.map((e) => ({ currency: e._id, commission: e.commission, gross: e.gross, payments: e.payments })),
      /** Released by the recruiter, waiting for Admin to confirm the money arrived. */
      pending: pending.map((e) => ({ currency: e._id, commission: e.commission, gross: e.gross, payments: e.payments })),
    };
  }

  /** Has Admin set a commission for this opening? Nothing is published without one. */
  async hasJobCommission(jobId: unknown) {
    return !!(await this.rules.resolve({ jobId }).then((r) => r.source === 'JOB'));
  }

  /** Checked before a request is approved so a bad figure never leaves it half-decided. */
  validate(input: { type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number } | undefined, spec: any, required = false) {
    if (!input) {
      if (required) throw new BadRequestException({ message: 'Set our commission before approving. No opening goes live without one', code: 'COMMISSION_REQUIRED' });
      return;
    }
    if (input.type === 'PERCENT' && !(input.percent !== undefined && input.percent >= 0 && input.percent < 100)) throw new BadRequestException('Enter a commission between 0 and 99.99%');
    if (input.type === 'FIXED') {
      if (!input.amount || input.amount <= 0) throw new BadRequestException('Enter the commission amount');
      if (spec?.compensation?.payBasis === 'HOUR') throw new BadRequestException('Hourly openings take a percentage commission, not a fixed amount');
      const min = spec?.compensation?.salaryMin;
      if (typeof min === 'number' && input.amount >= min) throw new BadRequestException('The commission would leave the candidate nothing at the lowest pay. Lower it');
    }
  }
}
