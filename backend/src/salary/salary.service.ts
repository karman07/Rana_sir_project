import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role, formatMoney } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService, type DomainEventPayload } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { grossForPeriod, kindForFrequency, kindOf, nextPeriod, periodEnd, periodOf, periodStart, shiftPeriod } from '../common/pay-period';
import { CommissionCalculationService, type CommissionRule } from '../contracts/commission-calculation.service';
import { addDays, todayUtc } from '../contracts/contract-terms';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Payslip } from '../payslips/schemas/payslip.schema';
import { SettingsService } from '../settings/settings.service';
import type { ListSalariesQueryDto, PublishDelayDto, ReportDelayDto } from './dto/salary.dto';
import { Salary, type SalaryDocument } from './schemas/salary.schema';

const LIVE = ['ACTIVE', 'EXPIRING'];
const BILLABLE = [...LIVE, 'EXPIRED', 'TERMINATED'];
/** Salary shows from this many completed months back, and one month ahead, so a candidate can see what is coming. */
const BACKFILL_MONTHS = 3;

const monthStart = periodStart;
const monthEnd = periodEnd;
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const SYSTEM = { id: null, role: 'SYSTEM' as const };
const actorOf = (u?: AuthUser) => (u ? { id: u.id, role: u.role } : SYSTEM);

@Injectable()
export class SalaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalaryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
    private readonly calc: CommissionCalculationService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('EMAIL_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.runGeneration().catch((e) => this.logger.error(e.message)), 60 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /* ---------------- status ---------------- */

  /** Where this salary stands, from the matching payment (if any) and any delay Admin has published. */
  statusFor(s: { period: string; delay?: { status?: string } }, pay?: Pick<Payment, 'status' | 'payout'> | null): string {
    let status: string;
    if (pay) {
      const o = pay.payout?.status;
      if (o === 'CONFIRMED' || o === 'SENT' || pay.status === 'COMPLETED' || pay.status === 'PAYOUT_SENT') status = 'PAID';
      else if (o === 'DISPUTED') status = 'DISPUTED';
      else if (pay.status === 'RECEIVED' || pay.status === 'CLIENT_PAID') status = 'PROCESSING';
      else status = 'PENDING';
    } else status = todayUtc() <= monthEnd(s.period) ? 'UPCOMING' : 'PENDING';
    return status !== 'PAID' && status !== 'DISPUTED' && s.delay?.status === 'PUBLISHED' ? 'DELAYED' : status;
  }

  /* ---------------- generation ---------------- */

  private async figures(c: Contract & { _id: unknown }, period: string, hoursWorked?: number) {
    const v = await this.versions.findOne({ contractId: c._id as never, version: c.currentVersion }).lean();
    if (!v) throw new NotFoundException('Contract terms not found');
    const rule = v.terms.commission as CommissionRule;
    const gross = grossForPeriod(kindOf(period), v.terms.salary, v.financials.monthly.grossAmount, hoursWorked);
    const split = this.calc.calculate(gross, rule);
    return { gross: split.grossAmount, net: split.candidateAmount, currency: v.terms.salary.currency, hourly: v.terms.salary.period === 'HOUR' };
  }

  private covers(c: Contract & { terminatedAt?: Date }, period: string) {
    const endsOn = c.endDate ?? (c.terminatedAt ? c.terminatedAt.toISOString().slice(0, 10) : undefined);
    return monthEnd(period) >= c.startDate! && !(endsOn && monthStart(period) > endsOn);
  }

  private async createFor(c: Contract & { _id: unknown }, period: string, hoursWorked?: number): Promise<SalaryDocument | null> {
    if (!BILLABLE.includes(c.status) || !this.covers(c, period)) return null;
    if (await this.salaries.exists({ contractId: c._id as never, period })) return null;
    const f = await this.figures(c, period, hoursWorked);
    const n = await this.counters.next('salary');
    const payDate = addDays(monthEnd(period), (await this.settings.get()).payments.salaryPayLagDays);
    try {
      return await this.salaries.create({
        salaryNumber: `SAL-${String(n).padStart(4, '0')}`, contractId: c._id as never, contractNumber: c.contractNumber, contractVersion: c.currentVersion, applicationId: c.applicationId, jobId: c.jobId,
        candidateId: c.candidateId, recruiterId: c.recruiterId, companyId: c.companyId, period, currency: f.currency, payDate, originalPayDate: payDate,
        amount: f.net, grossAmount: f.gross, hoursWorked, hourly: f.hourly, status: this.statusFor({ period }), delay: { status: 'NONE' }, history: [{ status: this.statusFor({ period }), at: new Date(), note: 'Created' }],
      });
    } catch (e: any) {
      if (e?.code === 11000) return null;
      throw e;
    }
  }

  /** Makes sure every active contract has salary records for recent months and the next one. Safe to run repeatedly. */
  async runGeneration() {
    const today = todayUtc();
    const live = await this.contracts.find({ status: { $in: BILLABLE }, startDate: { $lte: addDays(today, 40) } } as never);
    let created = 0;
    for (const c of live) {
      // Each opening says whether it is paid daily, weekly or monthly; its salary records follow.
      const job = await this.salaries.db.model('Job').findById(c.jobId).select('spec.compensation.payFrequency').lean<{ spec?: { compensation?: { payFrequency?: string } } }>();
      const kind = kindForFrequency(job?.spec?.compensation?.payFrequency);
      const current = periodOf(today, kind);
      const back = kind === 'MONTH' ? BACKFILL_MONTHS : kind === 'WEEK' ? BACKFILL_MONTHS * 4 : BACKFILL_MONTHS * 30;
      const from = [periodOf(c.startDate!, kind), shiftPeriod(current, -back)].sort().pop()!;
      const to = LIVE.includes(c.status) ? nextPeriod(current) : current;
      for (let p = from; p <= to; p = nextPeriod(p)) if (await this.createFor(c as never, p)) created++;
    }
    const refreshed = await this.refreshStatuses();
    return { created, refreshed };
  }

  /** UPCOMING becomes PENDING once the month is over. */
  private async refreshStatuses() {
    const rows = await this.salaries.find({ status: 'UPCOMING' });
    let n = 0;
    for (const s of rows) {
      const status = this.statusFor(s);
      if (status !== s.status) { await this.salaries.updateOne({ _id: s._id }, { status, $push: { history: { status, at: new Date() } } }); n++; }
    }
    return n;
  }

  /* ---------------- following payments and contracts ---------------- */

  /** Called whenever a payment moves: copies its figures and stage onto the salary, creating the salary if needed. */
  async syncFromPayment(paymentId: string) {
    const p = await this.payments.findById(paymentId).lean();
    if (!p) return;
    let s = await this.salaries.findOne({ contractId: p.contractId, period: p.period });
    if (!s) {
      const c = await this.contracts.findById(p.contractId);
      if (c) s = await this.createFor(c as never, p.period, p.hoursWorked);
      s ??= await this.salaries.findOne({ contractId: p.contractId, period: p.period });
    }
    if (!s) return;
    const status = this.statusFor(s, p as never);
    const wasPaid = s.status === 'PAID';
    const set: Record<string, unknown> = {
      paymentId: p._id, amount: p.candidateAmount, grossAmount: p.grossAmount, hoursWorked: p.hoursWorked ?? s.hoursWorked, currency: p.currency, contractVersion: p.contractVersion,
      confirmed: p.payout?.status === 'CONFIRMED', status,
    };
    if (status === 'PAID' && s.delay.status === 'PUBLISHED') set['delay.status'] = 'RESOLVED';
    const push = status !== s.status ? { $push: { history: { status, at: new Date(), note: p.status } } } : {};
    await this.salaries.updateOne({ _id: s._id }, { $set: set, ...push });
    if (status === 'PAID' && !wasPaid) {
      await this.events.publish(DomainEvent.SALARY_PAID, { actor: SYSTEM, entity: { type: 'Salary', id: s.id }, data: await this.eventData(s, { amountPaid: this.money(p.currency, p.candidateAmount) }) });
    }
  }

  /** A contract change recalculates what has not been paid yet; salaries already tied to a payment never move. */
  async onContractChanged(contractId: string) {
    const c = await this.contracts.findById(contractId);
    if (!c) return;
    const open = await this.salaries.find({ contractId: c._id, paymentId: { $exists: false }, status: { $in: ['UPCOMING', 'PENDING', 'DELAYED'] } });
    for (const s of open) {
      const f = await this.figures(c as never, s.period, s.hoursWorked);
      if (f.net !== s.amount || f.gross !== s.grossAmount) {
        await this.salaries.updateOne({ _id: s._id }, { amount: f.net, grossAmount: f.gross, currency: f.currency, contractVersion: c.currentVersion, $push: { history: { status: s.status, at: new Date(), note: `Recalculated for contract version ${c.currentVersion}` } } });
      }
    }
    await this.runGeneration(); // contract dates may have grown or shrunk
    const endsOn = c.endDate ?? (c.terminatedAt ? c.terminatedAt.toISOString().slice(0, 10) : undefined);
    if (endsOn) await this.salaries.updateMany({ contractId: c._id, paymentId: { $exists: false }, period: { $gt: periodOf(endsOn, 'MONTH') } }, { deletedAt: new Date() }); // monthly records; weekly and daily ones are limited by `covers`
  }

  /* ---------------- reads ---------------- */

  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.CANDIDATE) return { candidateId: new Types.ObjectId(user.id) };
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id) };
    return {};
  }

  private async load(id: string, user: AuthUser): Promise<SalaryDocument> {
    const doc = await this.salaries.findOne({ _id: id, ...this.scope(user) } as never);
    if (!doc) throw new NotFoundException('Salary not found');
    return doc;
  }

  private money(currency: string, n: number) { return formatMoney({ amount: n, currency }).replace(/\.00$/, ''); }

  private async eventData(s: SalaryDocument | Salary, extra: Record<string, unknown> = {}) {
    const p = await this.salaries.findById((s as any)._id).populate('candidateId', 'name').populate('recruiterId', 'name').populate({ path: 'jobId', select: 'spec.title' }).lean();
    return {
      salaryId: String((s as any)._id), salaryNumber: s.salaryNumber, period: s.period, contractNumber: s.contractNumber, contractId: String(s.contractId),
      candidateId: String(s.candidateId), recruiterId: String(s.recruiterId), candidateName: (p?.candidateId as any)?.name, recruiterName: (p?.recruiterId as any)?.name, jobTitle: (p?.jobId as any)?.spec?.title,
      payDate: s.payDate, ...extra,
    };
  }

  async list(q: ListSalariesQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.scope(user);
    if (q.statuses?.length) filter.status = { $in: q.statuses };
    if (q.period) filter.period = q.period;
    if (q.contractId) filter.contractId = new Types.ObjectId(q.contractId);
    if (q.candidateId && user.role !== Role.CANDIDATE) filter.candidateId = new Types.ObjectId(q.candidateId);
    const { items, meta } = await paginate(this.salaries, filter, q, {
      sortable: ['period', 'payDate', 'status', 'salaryNumber', 'createdAt'], defaultSort: '-period', searchFields: ['salaryNumber', 'contractNumber'],
      populate: ['candidateId', 'recruiterId', { path: 'jobId', populate: { path: 'companyId', select: 'name' } }] as never,
    });
    return { items: await Promise.all(items.map((s: any) => this.view(s, user))), meta };
  }

  async get(id: string, user: AuthUser) {
    const s = await this.salaries.findOne({ _id: id, ...this.scope(user) } as never)
      .populate('candidateId', 'name email').populate('recruiterId', 'name').populate({ path: 'jobId', select: 'spec.title companyId', populate: { path: 'companyId', select: 'name' } }).lean();
    if (!s) throw new NotFoundException('Salary not found');
    return this.view(s, user, true);
  }

  private async view(s: any, user: AuthUser, detail = false) {
    const cand = s.candidateId && typeof s.candidateId === 'object' ? s.candidateId : undefined;
    const rec = s.recruiterId && typeof s.recruiterId === 'object' ? s.recruiterId : undefined;
    const job = s.jobId && typeof s.jobId === 'object' ? s.jobId : undefined;
    const pay = s.paymentId ? await this.payments.findById(s.paymentId).select('paymentNumber status payout').lean() : null;
    const base = {
      id: String(s._id), salaryNumber: s.salaryNumber, contractId: String(s.contractId), contractNumber: s.contractNumber, period: s.period, currency: s.currency,
      payDate: s.payDate, originalPayDate: s.originalPayDate, status: s.status, hoursWorked: s.hoursWorked, job: { title: job?.spec?.title, company: job?.companyId?.name },
    };
    const reported = s.delay?.status === 'REPORTED';
    const payslip = s.paymentId ? await this.payslips.findOne({ paymentId: s.paymentId }).select('_id').lean() : null;

    if (user.role === Role.CANDIDATE) {
      // Candidates only ever see a delay once Admin has published it, with the reason and the new date.
      const published = ['PUBLISHED', 'RESOLVED'].includes(s.delay?.status);
      const visiblePayout = pay && ['PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'].includes(pay.payout?.status);
      return {
        ...base, amount: s.amount, confirmed: s.confirmed,
        delay: published ? { reason: s.delay.reason, newPayDate: s.delay.newPayDate, publishedAt: s.delay.publishedAt, resolved: s.delay.status === 'RESOLVED' } : undefined,
        paymentId: visiblePayout ? String(pay!._id) : undefined, paidOn: pay?.payout?.sentAt, method: pay?.payout?.method, reference: pay?.payout?.reference,
        payslipId: payslip ? String(payslip._id) : undefined,
        actions: pay && pay.payout?.status === 'SENT' ? ['confirm-payment'] : [],
      };
    }
    const actions: string[] = [];
    const unpaid = !['PAID', 'DISPUTED'].includes(s.status);
    if (user.role === Role.ADMIN) {
      if (reported) actions.push('publish-delay', 'reject-delay');
      else if (unpaid) actions.push('announce-delay');
    } else if (unpaid && !reported) actions.push('report-delay');
    if (s.hourly && !s.paymentId) actions.push('submit-hours');
    return {
      ...base, candidate: { id: String(cand?._id ?? s.candidateId), name: cand?.name, email: cand?.email }, recruiter: user.role === Role.ADMIN ? { id: String(rec?._id ?? s.recruiterId), name: rec?.name } : undefined,
      // The company-side figure for the recruiter; the candidate's own figure and the payment are Admin's.
      amount: user.role === Role.ADMIN ? s.amount : undefined, grossAmount: s.grossAmount, paymentId: user.role === Role.ADMIN && s.paymentId ? String(s.paymentId) : undefined,
      payment: user.role === Role.ADMIN && pay ? { id: String(pay._id), number: pay.paymentNumber, status: pay.status } : undefined,
      contractVersion: s.contractVersion, payslipId: payslip ? String(payslip._id) : undefined, hoursSubmittedBy: s.hoursSubmittedBy, delay: { status: s.delay?.status ?? 'NONE', reason: s.delay?.reason, newPayDate: s.delay?.newPayDate, reportedBy: s.delay?.reportedBy, reportedAt: s.delay?.reportedAt, decidedByName: s.delay?.decidedByName, decidedAt: s.delay?.decidedAt, decisionNote: s.delay?.decisionNote },
      delayLog: detail ? s.delayLog : undefined, history: detail ? s.history : undefined, hasPayment: !!s.paymentId, hourly: !!s.hourly,
      actions,
    };
  }

  async counts(user: AuthUser) {
    const rows = await this.salaries.aggregate([{ $match: this.scope(user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n])) as Record<string, number>;
    const delayReports = user.role === Role.CANDIDATE ? 0 : await this.salaries.countDocuments({ ...this.scope(user), 'delay.status': 'REPORTED' } as never);
    return { ...by, delayReports };
  }

  /* ---------------- hours (hourly contracts) ---------------- */

  /** The recruiter submits the hours worked for a period; billing for that month then uses them. */
  async submitHours(id: string, hoursWorked: number, user: AuthUser) {
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    const s = await this.load(id, user);
    const c = await this.contracts.findById(s.contractId);
    const v = c ? await this.versions.findOne({ contractId: c._id, version: c.currentVersion }).lean() : null;
    if (v?.terms.salary.period !== 'HOUR') throw new BadRequestException({ message: 'Hours only apply to hourly contracts', code: 'NOT_HOURLY' });
    if (s.paymentId) throw new ConflictException({ message: 'This period has already been billed. Ask Admin to adjust the payment', code: 'ALREADY_BILLED' });
    const f = await this.figures(c as never, s.period, hoursWorked);
    await this.salaries.updateOne({ _id: s._id }, {
      hoursWorked, amount: f.net, grossAmount: f.gross, hoursSubmittedBy: { id: user.id, name: user.name, role: user.role, at: new Date() },
      $push: { history: { status: s.status, at: new Date(), note: `${hoursWorked} hours submitted by ${user.name}` } },
    });
    await this.events.publish(DomainEvent.SALARY_HOURS_SUBMITTED, { actor: actorOf(user), entity: { type: 'Salary', id: s.id }, newState: { hoursWorked }, data: await this.eventData(s, { hoursWorked: String(hoursWorked) }) });
    return this.get(id, user);
  }

  /* ---------------- delays ---------------- */

  /** A recruiter reports that pay will be late (it waits for Admin); Admin can announce a delay directly. */
  async reportDelay(id: string, dto: ReportDelayDto, user: AuthUser) {
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    const s = await this.load(id, user);
    if (['PAID', 'DISPUTED'].includes(s.status)) throw new ConflictException({ message: 'This salary has already been paid', code: 'BAD_STATE' });
    if (s.delay.status === 'REPORTED') throw new ConflictException({ message: 'A delay is already waiting for Admin', code: 'DELAY_PENDING' });
    if (!validDay(dto.newPayDate) || dto.newPayDate < todayUtc()) throw new BadRequestException({ message: 'Choose a date that has not passed', code: 'VALIDATION_FAILED' });
    if (dto.newPayDate <= s.payDate) throw new BadRequestException({ message: 'The new date must be after the current expected date', code: 'VALIDATION_FAILED' });
    const by = { id: user.id, name: user.name, role: user.role };
    await this.salaries.updateOne({ _id: s._id }, {
      'delay.status': 'REPORTED', 'delay.reason': dto.reason, 'delay.newPayDate': dto.newPayDate, 'delay.reportedBy': by, 'delay.reportedAt': new Date(),
      $unset: { 'delay.decidedByName': 1, 'delay.decidedAt': 1, 'delay.decisionNote': 1 },
      $push: { delayLog: { status: 'REPORTED', reason: dto.reason, newPayDate: dto.newPayDate, byName: user.name, byRole: user.role, at: new Date() } },
    });
    if (user.role === Role.ADMIN) return this.publishDelay(id, user, {});
    const fresh = (await this.salaries.findById(s._id))!;
    await this.events.publish(DomainEvent.SALARY_DELAY_REPORTED, {
      actor: actorOf(user), entity: { type: 'Salary', id: s.id }, reason: dto.reason, newState: { newPayDate: dto.newPayDate },
      data: await this.eventData(fresh, { newPayDate: dto.newPayDate }),
    });
    return this.get(id, user);
  }

  /** Admin makes the delay public to the candidate, with the reason and the new date. */
  async publishDelay(id: string, admin: AuthUser, dto: PublishDelayDto) {
    const s = await this.load(id, admin);
    if (s.delay.status !== 'REPORTED') throw new ConflictException({ message: 'There is no delay waiting to be published', code: 'NOT_PENDING' });
    const reason = dto.reason ?? s.delay.reason!;
    const newPayDate = dto.newPayDate ?? s.delay.newPayDate!;
    if (!validDay(newPayDate) || newPayDate < todayUtc()) throw new BadRequestException({ message: 'Choose a date that has not passed', code: 'VALIDATION_FAILED' });
    const res = await this.salaries.findOneAndUpdate(
      { _id: s._id, 'delay.status': 'REPORTED' } as never,
      { 'delay.status': 'PUBLISHED', 'delay.reason': reason, 'delay.newPayDate': newPayDate, 'delay.decidedByName': admin.name, 'delay.decidedAt': new Date(), 'delay.publishedAt': new Date(), 'delay.decisionNote': dto.note, payDate: newPayDate,
        status: this.statusFor({ period: s.period, delay: { status: 'PUBLISHED' } }, s.paymentId ? await this.payments.findById(s.paymentId).select('status payout').lean() : null),
        $push: { delayLog: { status: 'PUBLISHED', reason, newPayDate, byName: admin.name, byRole: admin.role, at: new Date(), note: dto.note }, history: { status: 'DELAYED', at: new Date(), note: `Delayed to ${newPayDate}: ${reason}` } } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This delay was just decided', code: 'NOT_PENDING' });
    await this.events.publish(DomainEvent.SALARY_DELAYED, {
      actor: actorOf(admin), entity: { type: 'Salary', id: s.id }, reason, previousState: { payDate: s.payDate }, newState: { payDate: newPayDate },
      data: await this.eventData(res, { reason, newPayDate, previousPayDate: s.payDate, reportedByRole: s.delay.reportedBy?.role }),
    });
    return this.get(id, admin);
  }

  async rejectDelay(id: string, admin: AuthUser, note: string) {
    const s = await this.load(id, admin);
    if (s.delay.status !== 'REPORTED') throw new ConflictException({ message: 'There is no delay waiting to be decided', code: 'NOT_PENDING' });
    const res = await this.salaries.findOneAndUpdate(
      { _id: s._id, 'delay.status': 'REPORTED' } as never,
      { 'delay.status': 'REJECTED', 'delay.decidedByName': admin.name, 'delay.decidedAt': new Date(), 'delay.decisionNote': note,
        $push: { delayLog: { status: 'REJECTED', reason: s.delay.reason, newPayDate: s.delay.newPayDate, byName: admin.name, byRole: admin.role, at: new Date(), note } } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This delay was just decided', code: 'NOT_PENDING' });
    await this.events.publish(DomainEvent.SALARY_DELAY_REJECTED, { actor: actorOf(admin), entity: { type: 'Salary', id: s.id }, reason: note, data: await this.eventData(res, { reportedReason: s.delay.reason }) });
    return this.get(id, admin);
  }
}
