import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role, formatMoney } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { paginate } from '../common/database/paginate';
import { CounterService } from '../common/database/counter.service';
import { EventBusService } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { grossForPeriod, kindForFrequency, kindOf, nextPeriod, periodEnd, periodOf, periodStart, shiftPeriod, type PeriodKind } from '../common/pay-period';
import { CommissionCalculationService, type CommissionRule } from '../contracts/commission-calculation.service';
import { addDays, todayUtc } from '../contracts/contract-terms';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { DocumentsService, type StoredUpload } from '../documents/documents.service';
import { DocumentType } from '../documents/schemas/document.schema';
import type { AdjustPaymentDto, ConfirmBatchDto, ConfirmReceivedDto, GeneratePaymentDto, LedgerQueryDto, ListPaymentsQueryDto, MarkPaidDto, PayoutBatchDto, PayoutDto, ReleaseBatchDto, RequestPayDto } from './dto/payment.dto';
import { LedgerEntry, LedgerType } from './schemas/ledger-entry.schema';
import { Salary } from '../salary/schemas/salary.schema';
import { SettingsService } from '../settings/settings.service';
import { Payment, PaymentStage as S, type PaymentDocument } from './schemas/payment.schema';

const BILLABLE = ['ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'];
/** How far back the automatic run will fill in missed periods. */
const BACKFILL_DAYS = 92;

const monthStart = periodStart;
const monthEnd = periodEnd;

type Actor = { id: string; role: Role } | { id: null; role: 'SYSTEM' };
const actorOf = (u?: AuthUser): Actor => (u ? { id: u.id, role: u.role } : { id: null, role: 'SYSTEM' });

const idOf = (x: any) => (x && typeof x === 'object' && x._id ? String(x._id) : x ? String(x) : undefined);

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(LedgerEntry.name) private readonly ledger: Model<LedgerEntry>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    private readonly calc: CommissionCalculationService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly documents: DocumentsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Bills completed months and flags late payments, hourly. Admin can also run it by hand. */
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('EMAIL_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.runBilling().catch((e) => this.logger.error(e.message)), 60 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /* ---------------- helpers ---------------- */

  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id) };
    // Candidates only hear about a payment once the money is in and their payout is on its way.
    if (user.role === Role.CANDIDATE) return { candidateId: new Types.ObjectId(user.id), 'payout.status': { $in: ['PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'] } };
    return {};
  }

  private async load(id: string, user: AuthUser): Promise<PaymentDocument> {
    const doc = await this.payments.findOne({ _id: id, ...this.scope(user) } as never);
    if (!doc) throw new NotFoundException('Payment not found');
    return doc;
  }

  private entry(user: AuthUser | undefined, status: string, note?: string) {
    return { status, at: new Date(), byId: user?.id, byName: user?.name ?? 'System', byRole: user?.role ?? 'SYSTEM', note };
  }

  private money(p: { currency: string }, n: number) { return formatMoney({ amount: n, currency: p.currency }).replace(/\.00$/, ''); }

  private async eventData(p: PaymentDocument | Payment, extra: Record<string, unknown> = {}) {
    const populated = await this.payments.findById((p as any)._id).populate('candidateId', 'name').populate('recruiterId', 'name').populate({ path: 'jobId', select: 'spec.title' }).lean();
    return {
      paymentId: String((p as any)._id), paymentNumber: p.paymentNumber, period: p.period, contractNumber: p.contractNumber, contractId: String(p.contractId),
      candidateId: String(p.candidateId), recruiterId: String(p.recruiterId), candidateName: (populated?.candidateId as any)?.name, recruiterName: (populated?.recruiterId as any)?.name,
      jobTitle: (populated?.jobId as any)?.spec?.title, dueDate: p.dueDate,
      // What each audience may be told: the company sees the amount it owes, the candidate sees their own pay.
      amountDue: this.money(p, p.grossAmount), candidatePay: this.money(p, p.candidateAmount), ...extra,
    };
  }

  /* ---------------- generate ---------------- */

  async generate(dto: GeneratePaymentDto, admin: AuthUser, opts: { quiet?: boolean } = {}) {
    const c = await this.contracts.findById(dto.contractId);
    if (!c) throw new NotFoundException('Contract not found');
    return this.createFor(c, dto.period, dto.hoursWorked, admin, opts);
  }

  private async createFor(c: Contract & { _id: unknown; terminatedAt?: Date }, period: string, hoursWorked: number | undefined, actor: AuthUser | undefined, opts: { quiet?: boolean } = {}) {
    if (!BILLABLE.includes(c.status)) throw new ConflictException({ message: 'Payments start once a contract is active', code: 'NOT_ACTIVE' });
    const endsOn = c.endDate ?? (c.terminatedAt ? c.terminatedAt.toISOString().slice(0, 10) : undefined);
    if (monthEnd(period) < c.startDate! || (endsOn && monthStart(period) > endsOn)) throw new BadRequestException({ message: 'That period is outside the contract dates', code: 'OUT_OF_RANGE' });

    const v = await this.versions.findOne({ contractId: c._id as never, version: c.currentVersion }).lean();
    if (!v) throw new NotFoundException('Contract terms not found');
    const rule = v.terms.commission as CommissionRule;
    const salary = v.terms.salary;
    // Hours the recruiter already submitted for this period are what we bill, unless Admin names others.
    if (salary.period === 'HOUR' && hoursWorked === undefined) hoursWorked = (await this.salaries.findOne({ contractId: c._id as never, period }).select('hoursWorked').lean())?.hoursWorked;
    // A month, a week or a day: whichever the period key says.
    const gross = grossForPeriod(kindOf(period), salary, v.financials.monthly.grossAmount, hoursWorked);
    const split = this.calc.calculate(gross, rule);

    // Check first so repeat runs never burn payment numbers.
    if (await this.payments.exists({ contractId: c._id as never, period })) throw new ConflictException({ message: `A payment for ${period} already exists on this contract`, code: 'PAYMENT_EXISTS' });
    const n = await this.counters.next('payment');
    try {
      const p = await this.payments.create({
        paymentNumber: `PAY-${String(n).padStart(4, '0')}`, transactionId: `TXN-${todayUtc().replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`,
        contractId: c._id as never, contractNumber: c.contractNumber, contractVersion: c.currentVersion, applicationId: c.applicationId, jobId: c.jobId, candidateId: c.candidateId, recruiterId: c.recruiterId, companyId: c.companyId,
        period, dueDate: addDays(monthEnd(period), (await this.settings.get()).payments.dueGraceDays), currency: v.terms.salary.currency, hoursWorked: salary.period === 'HOUR' ? hoursWorked : undefined,
        grossAmount: split.grossAmount, commissionAmount: split.commission, candidateAmount: split.candidateAmount, rule,
        status: S.AWAITING_CLIENT, client: { status: 'AWAITING' }, payout: { status: 'NOT_DUE' }, history: [this.entry(actor, S.AWAITING_CLIENT, 'Payment created')],
      });
      if (!opts.quiet) {
        await this.events.publish(DomainEvent.PAYMENT_GENERATED, {
          actor: actorOf(actor), entity: { type: 'Payment', id: p.id }, data: await this.eventData(p),
        });
      }
      return this.get(p.id, actor ?? ({ id: 'system', role: Role.ADMIN, name: 'System', email: '' } as AuthUser));
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException({ message: `A payment for ${period} already exists on this contract`, code: 'PAYMENT_EXISTS' });
      throw e;
    }
  }

  /** Creates the payment for each completed month that doesn't have one yet, then flags late ones. */
  async runBilling() {
    const today = todayUtc();
    const live = await this.contracts.find({ status: { $in: BILLABLE }, startDate: { $lte: today } } as never);
    let created = 0;
    for (const c of live) {
      // Each opening says how it is paid: every day, every week or every month.
      const job = await this.payments.db.model('Job').findById(c.jobId).select('spec.compensation.payFrequency').lean<{ spec?: { compensation?: { payFrequency?: string } } }>();
      const kind: PeriodKind = kindForFrequency(job?.spec?.compensation?.payFrequency);
      const current = periodOf(today, kind);
      let period = periodOf(c.startDate!, kind);
      const floor = periodOf(new Date(Date.parse(`${today}T00:00:00Z`) - BACKFILL_DAYS * 86_400_000).toISOString().slice(0, 10), kind);
      if (period < floor) period = floor;
      for (; period < current; period = nextPeriod(period)) {
        try { await this.createFor(c as never, period, undefined, undefined, {}); created++; } catch { /* exists, outside the contract dates, or not billable */ }
      }
    }
    const overdueRows = await this.payments.find({ status: S.AWAITING_CLIENT, dueDate: { $lt: today }, overdueNotifiedAt: { $exists: false } } as never);
    let overdue = 0;
    for (const p of overdueRows) {
      const done = await this.payments.updateOne({ _id: p._id, overdueNotifiedAt: { $exists: false } } as never, { overdueNotifiedAt: new Date() });
      if (!done.modifiedCount) continue;
      overdue++;
      await this.events.publish(DomainEvent.PAYMENT_OVERDUE, { actor: actorOf(), entity: { type: 'Payment', id: p.id }, data: await this.eventData(p) });
    }
    return { created, overdue };
  }

  /* ---------------- reads ---------------- */

  async list(q: ListPaymentsQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.scope(user);
    if (q.statuses?.length) filter.status = { $in: q.statuses };
    if (q.period) filter.period = q.period;
    if (q.contractId) filter.contractId = new Types.ObjectId(q.contractId);
    if (q.candidateId && user.role !== Role.CANDIDATE) filter.candidateId = new Types.ObjectId(q.candidateId);
    if (q.overdue) { filter.status = S.AWAITING_CLIENT; filter.dueDate = { $lt: todayUtc() }; }
    if (q.requested) filter['candidateRequest.at'] = { $exists: true };
    const { items, meta } = await paginate(this.payments, filter, q, {
      sortable: ['createdAt', 'period', 'dueDate', 'status', 'paymentNumber', 'grossAmount'], defaultSort: '-period', searchFields: ['paymentNumber', 'transactionId', 'contractNumber'],
      populate: ['candidateId', 'recruiterId', { path: 'jobId', populate: { path: 'companyId', select: 'name' } }] as never,
    });
    return { items: items.map((p: any) => this.view(p, user)), meta };
  }

  async get(id: string, user: AuthUser) {
    const doc = await this.payments.findOne({ _id: id, ...this.scope(user) } as never)
      .populate('candidateId', 'name email').populate('recruiterId', 'name email').populate({ path: 'jobId', select: 'spec.title companyId', populate: { path: 'companyId', select: 'name' } }).lean();
    if (!doc) throw new NotFoundException('Payment not found');
    const out: any = this.view(doc, user);
    if (user.role === Role.ADMIN) out.ledger = (await this.ledger.find({ paymentId: doc._id }).sort({ createdAt: 1, _id: 1 }).lean()).map((l) => this.presentLedger(l));
    return out;
  }

  private requestView(p: any) {
    return p.candidateRequest?.at ? { at: p.candidateRequest.at, note: p.candidateRequest.note } : undefined;
  }

  /** What each role is allowed to know about a payment. Commission and the split are Admin-only. */
  private view(p: any, user: AuthUser) {
    const cand = p.candidateId && typeof p.candidateId === 'object' ? p.candidateId : undefined;
    const rec = p.recruiterId && typeof p.recruiterId === 'object' ? p.recruiterId : undefined;
    const job = p.jobId && typeof p.jobId === 'object' ? p.jobId : undefined;
    const base = {
      id: String(p._id), paymentNumber: p.paymentNumber, transactionId: p.transactionId, contractId: String(p.contractId?._id ?? p.contractId), contractNumber: p.contractNumber,
      period: p.period, dueDate: p.dueDate, currency: p.currency, createdAt: p.createdAt,
      job: { title: job?.spec?.title, company: job?.companyId?.name },
    };
    const overdue = p.status === S.AWAITING_CLIENT && p.dueDate < todayUtc();
    const proof = (id?: unknown) => (id ? String(id) : undefined);

    if (user.role === Role.ADMIN) {
      return {
        ...base, status: p.status, overdue, hoursWorked: p.hoursWorked, contractVersion: p.contractVersion,
        gross: p.grossAmount, commission: p.commissionAmount, candidateAmount: p.candidateAmount, rule: p.rule,
        candidate: { id: idOf(p.candidateId), name: cand?.name, email: cand?.email }, recruiter: { id: idOf(p.recruiterId), name: rec?.name },
        client: { ...p.client, proofDocumentId: proof(p.client?.proofDocumentId) }, payout: { ...p.payout, proofDocumentId: proof(p.payout?.proofDocumentId) },
        history: p.history, cancelledReason: p.cancelledReason, actions: this.actionsFor(p, user), candidateRequest: this.requestView(p),
      };
    }
    if (user.role === Role.RECRUITER) {
      const c = p.client ?? {};
      return {
        ...base, status: p.status === S.CANCELLED ? S.CANCELLED : p.status === S.DISPUTED && c.status !== 'DISPUTED' ? S.COMPLETED : [S.AWAITING_CLIENT, S.CLIENT_PAID, S.DISPUTED, S.CANCELLED].includes(p.status) ? p.status : S.RECEIVED,
        overdue, amountDue: p.grossAmount, candidate: { name: cand?.name }, candidateRequest: this.requestView(p),
        client: { status: c.status, amountSent: c.amountSent, sentAt: c.sentAt, method: c.method, reference: c.reference, note: c.note, disputeNote: c.disputeNote, proofDocumentId: proof(c.proofDocumentId) },
        actions: this.actionsFor(p, user),
      };
    }
    const o = p.payout ?? {};
    return {
      ...base, amount: p.candidateAmount, contractId: base.contractId,
      status: o.status === 'CONFIRMED' ? 'RECEIVED' : o.status === 'SENT' ? 'SENT' : o.status === 'DISPUTED' ? 'DISPUTED' : 'PROCESSING',
      payout: { status: o.status, sentAt: o.sentAt, method: o.method, reference: o.reference, note: o.note, confirmedAt: o.confirmedAt, disputeNote: o.disputeNote, proofDocumentId: proof(o.proofDocumentId) },
      actions: this.actionsFor(p, user),
    };
  }

  private actionsFor(p: any, user: AuthUser): string[] {
    const out: string[] = [];
    const c = p.client?.status, o = p.payout?.status;
    if (user.role === Role.RECRUITER && p.status !== S.CANCELLED && (c === 'AWAITING' || c === 'DISPUTED')) out.push('mark-paid');
    if (user.role === Role.RECRUITER && c === 'MARKED_PAID') out.push('upload-proof');
    if (user.role === Role.CANDIDATE) { if (o === 'SENT') out.push('confirm-payout', 'dispute-payout'); }
    if (user.role === Role.ADMIN) {
      if (c === 'AWAITING' || c === 'DISPUTED') out.push('mark-paid');
      if (c === 'MARKED_PAID') out.push('confirm-received', 'dispute-client');
      if (c === 'DISPUTED') out.push('resolve-client');
      if (o === 'PENDING' || o === 'DISPUTED') out.push('send-payout');
      if (o === 'DISPUTED') out.push('resolve-payout');
      if (o === 'SENT') out.push('upload-proof');
      if (['AWAITING', 'MARKED_PAID', 'DISPUTED'].includes(c ?? '') && p.status !== S.CANCELLED && o === 'NOT_DUE') out.push('cancel', 'adjust');
    }
    return out;
  }

  presentLedger(l: any) {
    return { id: String(l._id), paymentId: String(l.paymentId), paymentNumber: l.paymentNumber, transactionId: l.transactionId, contractNumber: l.contractNumber, type: l.type, amount: l.amount, currency: l.currency, period: l.period, reference: l.reference, memo: l.memo, createdAt: l.createdAt };
  }

  async counts(user: AuthUser) {
    const rows = await this.payments.aggregate([{ $match: this.scope(user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n])) as Record<string, number>;
    const overdue = await this.payments.countDocuments({ ...this.scope(user), status: S.AWAITING_CLIENT, dueDate: { $lt: todayUtc() } } as never);
    const payoutsDue = await this.payments.countDocuments({ ...this.scope(user), 'payout.status': { $in: ['PENDING'] } } as never);
    return { ...by, overdue, payoutsDue, needsAction: user.role === Role.ADMIN ? (by.CLIENT_PAID ?? 0) + payoutsDue + (by.DISPUTED ?? 0) : user.role === Role.RECRUITER ? (by.AWAITING_CLIENT ?? 0) + (by.DISPUTED ?? 0) : (by.PAYOUT_SENT ?? 0) };
  }

  /* ---------------- client leg ---------------- */

  /** The company (via its recruiter) records that it paid us. Admin can record it on their behalf. */
  async markPaid(id: string, dto: MarkPaidDto, user: AuthUser, opts: { quiet?: boolean; batchRef?: string } = {}) {
    const p = await this.load(id, user);
    if (user.role !== Role.ADMIN && user.role !== Role.RECRUITER) throw new ForbiddenException();
    if (!['AWAITING', 'DISPUTED'].includes(p.client.status) || p.status === S.CANCELLED) throw new ConflictException({ message: 'This payment is not waiting for the company to pay', code: 'BAD_STATE' });
    const amount = dto.amount ?? p.grossAmount;
    // Commission follows what was actually released: a different amount recalculates the split straight away, and the original is kept.
    const split = this.calc.calculate(amount, p.rule as CommissionRule);
    const changed = split.grossAmount !== p.grossAmount;
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'client.status': { $in: ['AWAITING', 'DISPUTED'] } } as never,
      { status: S.CLIENT_PAID, ...(opts.batchRef ? { 'client.batchRef': opts.batchRef } : {}), ...(changed ? { grossAmount: split.grossAmount, commissionAmount: split.commission, candidateAmount: split.candidateAmount, dueGross: p.dueGross ?? p.grossAmount } : {}), 'client.status': 'MARKED_PAID', 'client.amountSent': amount, 'client.sentAt': new Date(), 'client.method': dto.method, 'client.reference': dto.reference, 'client.note': dto.note, 'client.markedBy': new Types.ObjectId(user.id), $unset: { 'client.disputeNote': 1 }, $push: { history: this.entry(user, S.CLIENT_PAID, `${dto.method} · ${dto.reference}`) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    if (!opts.quiet) await this.events.publish(DomainEvent.PAYMENT_CLIENT_PAID, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Payment', id: p.id }, data: await this.eventData(res, { amountSent: this.money(res, amount), commission: this.money(res, res.commissionAmount), candidatePayAmount: this.money(res, res.candidateAmount), due: res.dueGross !== undefined ? this.money(res, res.dueGross) : undefined, method: dto.method, reference: dto.reference }),
    });
    return this.get(id, user);
  }

  /** Admin has checked the money arrived. A different amount is a dispute, not a silent shortfall. */
  async confirmReceived(id: string, dto: ConfirmReceivedDto, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (p.client.status !== 'MARKED_PAID') throw new ConflictException({ message: 'The company has not marked this as paid', code: 'BAD_STATE' });
    if (dto.amountReceived !== p.grossAmount) {
      const note = `Expected ${this.money(p, p.grossAmount)}, received ${this.money(p, dto.amountReceived)}${dto.note ? ` — ${dto.note}` : ''}`;
      return this.dispute(id, note, admin, { amountReceived: dto.amountReceived });
    }
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'client.status': 'MARKED_PAID' } as never,
      { status: S.RECEIVED, 'client.status': 'RECEIVED', 'client.amountReceived': dto.amountReceived, 'client.confirmedAt': new Date(), 'client.confirmedBy': new Types.ObjectId(admin.id), 'payout.status': 'PENDING', $push: { history: this.entry(admin, S.RECEIVED, dto.note) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.record(res, LedgerType.CLIENT_RECEIPT, dto.amountReceived, admin, res.client.reference);
    await this.record(res, LedgerType.COMMISSION, res.commissionAmount, admin);
    await this.events.publish(DomainEvent.PAYMENT_RECEIVED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, data: await this.eventData(res) });
    return this.get(id, admin);
  }

  /** Admin disputes the company's payment (not received, wrong amount, bad reference). The company can record it again. */
  async dispute(id: string, note: string, admin: AuthUser, extra: { amountReceived?: number } = {}) {
    const p = await this.load(id, admin);
    if (p.client.status !== 'MARKED_PAID') throw new ConflictException({ message: 'There is no payment to dispute', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'client.status': 'MARKED_PAID' } as never,
      { status: S.DISPUTED, 'client.status': 'DISPUTED', 'client.disputeNote': note, ...(extra.amountReceived !== undefined ? { 'client.amountReceived': extra.amountReceived } : {}), $push: { history: this.entry(admin, S.DISPUTED, note) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.events.publish(DomainEvent.PAYMENT_DISPUTED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, reason: note, data: await this.eventData(res, { leg: 'client' }) });
    return this.get(id, admin);
  }

  /** Admin settles a disputed company payment (e.g. the money turned up elsewhere). Needs a reason and is audited. */
  async resolveClient(id: string, note: string, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (p.client.status !== 'DISPUTED') throw new ConflictException({ message: 'This payment is not in dispute', code: 'BAD_STATE' });
    const received = p.client.amountReceived ?? p.client.amountSent ?? p.grossAmount;
    // Settling at the amount that actually arrived: commission and the candidate's share are worked out on that, not on what was first due.
    const split = this.calc.calculate(received, p.rule as CommissionRule);
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'client.status': 'DISPUTED' } as never,
      { status: S.RECEIVED, ...(split.grossAmount !== p.grossAmount ? { grossAmount: split.grossAmount, commissionAmount: split.commission, candidateAmount: split.candidateAmount, dueGross: p.dueGross ?? p.grossAmount } : {}), 'client.status': 'RECEIVED', 'client.amountReceived': received, 'client.confirmedAt': new Date(), 'client.confirmedBy': new Types.ObjectId(admin.id), 'payout.status': 'PENDING', $push: { history: this.entry(admin, S.RECEIVED, `Resolved: ${note}`) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.record(res, LedgerType.CLIENT_RECEIPT, received, admin, res.client.reference, note);
    await this.record(res, LedgerType.COMMISSION, res.commissionAmount, admin, undefined, note);
    await this.events.publish(DomainEvent.PAYMENT_RESOLVED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, reason: note, data: await this.eventData(res, { leg: 'client' }) });
    return this.get(id, admin);
  }

  /* ---------------- several at once ---------------- */

  /** Loads every payment or fails naming the ones that cannot be used, so a batch is all or nothing. */
  private async loadAll(ids: string[], user: AuthUser, ok: (p: PaymentDocument) => boolean, why: string) {
    const unique = [...new Set(ids)];
    const docs = await this.payments.find({ _id: { $in: unique }, ...this.scope(user) } as never);
    const found = new Map(docs.map((d) => [String(d._id), d]));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) throw new NotFoundException({ message: `${missing.length} of these payments were not found`, code: 'NOT_FOUND', details: missing });
    const bad = docs.filter((d) => !ok(d));
    if (bad.length) throw new ConflictException({ message: `${why}: ${bad.map((b) => b.paymentNumber).join(', ')}`, code: 'BAD_STATE', details: bad.map((b) => b.paymentNumber) });
    return unique.map((id) => found.get(id)!);
  }

  private totals(docs: { currency: string }[], pick: (d: any) => number) {
    const by = new Map<string, number>();
    for (const d of docs) by.set(d.currency, (by.get(d.currency) ?? 0) + pick(d));
    return [...by].map(([currency, amount]) => ({ currency, amount }));
  }
  private totalsText(t: { currency: string; amount: number }[]) { return t.map((x) => this.money(x, x.amount)).join(' + '); }

  /**
   * The recruiter tells us, once, that the company has sent one transfer covering several candidates' pay.
   * Each payment is recorded against the same reference; Admin gets a single notice.
   */
  async releaseBatch(dto: ReleaseBatchDto, user: AuthUser) {
    if (user.role !== Role.ADMIN && user.role !== Role.RECRUITER) throw new ForbiddenException();
    const docs = await this.loadAll(dto.paymentIds, user, (p) => ['AWAITING', 'DISPUTED'].includes(p.client.status) && p.status !== S.CANCELLED, 'These are not waiting for payment');
    const amounts = new Map((dto.amounts ?? []).map((a) => [a.paymentId, a.amount]));
    for (const id of amounts.keys()) if (!dto.paymentIds.includes(id)) throw new BadRequestException({ message: 'An amount was given for a payment that is not in this release', code: 'VALIDATION_FAILED' });
    const batchRef = `REL-${todayUtc().replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const done: PaymentDocument[] = [];
    for (const d of docs) {
      await this.markPaid(String(d._id), { method: dto.method, reference: dto.reference, amount: amounts.get(String(d._id)), note: dto.note }, user, { quiet: true, batchRef });
      done.push(d);
    }
    const fresh = await this.payments.find({ _id: { $in: docs.map((d) => d._id) } }).lean();
    const total = this.totals(fresh, (p) => p.grossAmount);
    await this.events.publish(DomainEvent.PAYMENT_BATCH_RELEASED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'PaymentBatch', id: batchRef },
      data: {
        batchRef, count: done.length, total: this.totalsText(total), commission: this.totalsText(this.totals(fresh, (p) => p.commissionAmount)), method: dto.method, reference: dto.reference,
        recruiterId: String(docs[0].recruiterId), recruiterName: user.name, paymentNumbers: fresh.map((p) => p.paymentNumber).join(', '),
        candidateIds: [...new Set(fresh.map((p) => String(p.candidateId)))],
      },
    });
    return { batchRef, count: done.length, total, payments: fresh.map((p) => ({ id: String(p._id), paymentNumber: p.paymentNumber, status: p.status, amount: p.grossAmount })) };
  }

  /**
   * One transfer reached our account for several payments. If the total is right every payment is confirmed;
   * if it is not, none is confirmed and each is held as a dispute so nothing is paid out on money that did not arrive.
   */
  async confirmBatch(dto: ConfirmBatchDto, admin: AuthUser) {
    const docs = await this.loadAll(dto.paymentIds, admin, (p) => p.client.status === 'MARKED_PAID', 'The company has not released these');
    if (new Set(docs.map((d) => d.currency)).size > 1) throw new BadRequestException({ message: 'Confirm payments in one currency at a time', code: 'VALIDATION_FAILED' });
    const expected = docs.reduce((n, d) => n + d.grossAmount, 0);
    if (dto.amountReceived !== expected) {
      const note = `Expected ${this.money(docs[0], expected)} for ${docs.length} payments, received ${this.money(docs[0], dto.amountReceived)}${dto.note ? ` — ${dto.note}` : ''}`;
      for (const d of docs) await this.dispute(String(d._id), note, admin, {});
      return { confirmed: 0, disputed: docs.length, expected, received: dto.amountReceived };
    }
    for (const d of docs) await this.confirmReceived(String(d._id), { amountReceived: d.grossAmount, note: dto.note }, admin);
    return { confirmed: docs.length, disputed: 0, expected, received: dto.amountReceived };
  }

  /** Admin forwards several candidates' pay in one go, with one reference. */
  async sendPayoutBatch(dto: PayoutBatchDto, admin: AuthUser) {
    const docs = await this.loadAll(dto.paymentIds, admin, (p) => ['PENDING', 'DISPUTED'].includes(p.payout.status), 'These payouts are not due');
    for (const d of docs) await this.sendPayout(String(d._id), { method: dto.method, reference: dto.reference, note: dto.note }, admin);
    return { sent: docs.length, total: this.totals(docs, (p) => p.candidateAmount) };
  }

  /* ---------------- the candidate asks for their pay ---------------- */

  /** A candidate asks for the pay for a period. It appears on the recruiter's and Admin's payments, and the company is asked to release it. */
  async requestPay(dto: RequestPayDto, candidate: AuthUser) {
    const mine = { candidateId: new Types.ObjectId(candidate.id), status: { $in: BILLABLE } } as Record<string, unknown>;
    if (dto.contractId) mine._id = new Types.ObjectId(dto.contractId);
    const contracts = await this.contracts.find(mine as never).sort({ startDate: -1 });
    if (!contracts.length) throw new NotFoundException({ message: 'You have no active contract to be paid under', code: 'NO_CONTRACT' });
    if (contracts.length > 1 && !dto.contractId) throw new BadRequestException({ message: 'Say which contract this is for', code: 'CONTRACT_REQUIRED' });
    const c = contracts[0];

    const job = await this.payments.db.model('Job').findById(c.jobId).select('spec.compensation.payFrequency').lean<{ spec?: { compensation?: { payFrequency?: string } } }>();
    const kind = kindForFrequency(job?.spec?.compensation?.payFrequency);
    const today = todayUtc();
    const period = dto.period ?? periodOf(today, kind);
    if (kindOf(period) !== kind) throw new BadRequestException({ message: `This job is paid ${kind === 'MONTH' ? 'monthly' : kind === 'WEEK' ? 'weekly' : 'daily'}. Ask for a ${kind === 'MONTH' ? 'month' : kind === 'WEEK' ? 'week' : 'day'}`, code: 'WRONG_PERIOD' });
    if (periodStart(period) > today) throw new BadRequestException({ message: 'You can only ask for pay that has started', code: 'FUTURE_PERIOD' });

    let p = await this.payments.findOne({ contractId: c._id, period });
    if (!p) await this.createFor(c as never, period, undefined, undefined, { quiet: true });
    p = await this.payments.findOne({ contractId: c._id, period });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.candidateRequest?.at) throw new ConflictException({ message: 'You have already asked for this pay', code: 'REQUEST_EXISTS' });
    if (p.status !== S.AWAITING_CLIENT && p.client.status !== 'DISPUTED') throw new ConflictException({ message: 'This pay is already on its way', code: 'ALREADY_IN_PROGRESS' });

    const res = await this.payments.findOneAndUpdate({ _id: p._id, 'candidateRequest.at': { $exists: false } } as never, {
      candidateRequest: { at: new Date(), by: new Types.ObjectId(candidate.id), note: dto.note?.trim() || undefined },
      $push: { history: this.entry(candidate, p.status, dto.note ? `Pay requested: ${dto.note}` : 'Pay requested by the candidate') },
    }, { returnDocument: 'after' });
    if (!res) throw new ConflictException({ message: 'You have already asked for this pay', code: 'REQUEST_EXISTS' });
    await this.events.publish(DomainEvent.PAYMENT_REQUESTED, {
      actor: { id: candidate.id, role: candidate.role }, entity: { type: 'Payment', id: res.id }, reason: dto.note, data: await this.eventData(res, { note: dto.note }),
    });
    return this.myRequests(candidate).then((r) => r.find((x) => x.id === res.id));
  }

  /** The candidate's own requests and where each one has got to. */
  async myRequests(candidate: AuthUser) {
    const rows = await this.payments.find({ candidateId: new Types.ObjectId(candidate.id), 'candidateRequest.at': { $exists: true } }).sort({ 'candidateRequest.at': -1 }).limit(50)
      .populate({ path: 'jobId', select: 'spec.title' }).lean();
    const stage = (p: any) => p.status === S.CANCELLED ? 'Cancelled' : p.payout?.status === 'CONFIRMED' || p.status === S.COMPLETED ? 'Paid' : p.payout?.status === 'SENT' ? 'Sent to you. Please confirm'
      : p.status === S.RECEIVED ? 'Being sent to you' : p.status === S.CLIENT_PAID ? 'The company has released it' : p.status === S.DISPUTED ? 'Being sorted out' : 'Waiting for the company';
    return rows.map((p: any) => ({
      id: String(p._id), period: p.period, job: p.jobId?.spec?.title, requestedAt: p.candidateRequest.at, note: p.candidateRequest.note, amount: p.candidateAmount, currency: p.currency,
      stage: stage(p), canConfirm: p.payout?.status === 'SENT',
    }));
  }

  /* ---------------- payout leg ---------------- */

  async sendPayout(id: string, dto: PayoutDto, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (!['PENDING', 'DISPUTED'].includes(p.payout.status)) throw new ConflictException({ message: 'The candidate\'s payout is not due yet', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': { $in: ['PENDING', 'DISPUTED'] } } as never,
      { status: S.PAYOUT_SENT, 'payout.status': 'SENT', 'payout.amountSent': p.candidateAmount, 'payout.sentAt': new Date(), 'payout.method': dto.method, 'payout.reference': dto.reference, 'payout.note': dto.note, 'payout.sentBy': new Types.ObjectId(admin.id), $unset: { 'payout.disputeNote': 1 }, $push: { history: this.entry(admin, S.PAYOUT_SENT, `${dto.method} · ${dto.reference}`) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    // Sending again after a disputed payout means the first transfer did not land: reverse it so the books stay true.
    if (p.payout.status === 'DISPUTED') await this.record(res, LedgerType.REVERSAL, p.candidateAmount, admin, p.payout.reference, `Payout ${p.payout.reference ?? ''} reported as not received`);
    await this.record(res, LedgerType.CANDIDATE_PAYOUT, -p.candidateAmount, admin, dto.reference);
    await this.events.publish(DomainEvent.PAYMENT_PAYOUT_SENT, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, data: await this.eventData(res, { method: dto.method, reference: dto.reference }) });
    return this.get(id, admin);
  }

  async confirmPayout(id: string, candidate: AuthUser) {
    const p = await this.load(id, candidate);
    if (p.payout.status !== 'SENT') throw new ConflictException({ message: 'There is no payment to confirm', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': 'SENT' } as never,
      { status: S.COMPLETED, 'payout.status': 'CONFIRMED', 'payout.confirmedAt': new Date(), $push: { history: this.entry(candidate, S.COMPLETED, 'Receipt confirmed') } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.events.publish(DomainEvent.PAYMENT_PAYOUT_CONFIRMED, { actor: { id: candidate.id, role: candidate.role }, entity: { type: 'Payment', id: p.id }, data: await this.eventData(res) });
    return this.get(id, candidate);
  }

  async disputePayout(id: string, note: string, candidate: AuthUser) {
    const p = await this.load(id, candidate);
    if (p.payout.status !== 'SENT') throw new ConflictException({ message: 'There is no payment to dispute', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': 'SENT' } as never,
      { status: S.DISPUTED, 'payout.status': 'DISPUTED', 'payout.disputeNote': note, $push: { history: this.entry(candidate, S.DISPUTED, note) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.events.publish(DomainEvent.PAYMENT_DISPUTED, { actor: { id: candidate.id, role: candidate.role }, entity: { type: 'Payment', id: p.id }, reason: note, data: await this.eventData(res, { leg: 'payout' }) });
    return this.get(id, candidate);
  }

  /** Admin closes a disputed payout after sorting it out with the candidate. */
  async resolvePayout(id: string, note: string, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (p.payout.status !== 'DISPUTED') throw new ConflictException({ message: 'This payout is not in dispute', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': 'DISPUTED' } as never,
      { status: S.COMPLETED, 'payout.status': 'CONFIRMED', 'payout.confirmedAt': new Date(), $push: { history: this.entry(admin, S.COMPLETED, `Resolved: ${note}`) } },
      { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.events.publish(DomainEvent.PAYMENT_RESOLVED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, reason: note, data: await this.eventData(res, { leg: 'payout' }) });
    return this.get(id, admin);
  }

  /* ---------------- admin corrections ---------------- */

  /** Hours or the amount can still change while nobody has paid; commission is recalculated from the stored rule. */
  async adjust(id: string, dto: AdjustPaymentDto, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (p.payout.status !== 'NOT_DUE' || p.status === S.CANCELLED || p.client.status === 'RECEIVED') throw new ConflictException({ message: 'The amount can no longer be changed', code: 'BAD_STATE' });
    const v = await this.versions.findOne({ contractId: p.contractId, version: p.contractVersion }).lean();
    let gross = dto.grossAmount;
    if (gross === undefined && dto.hoursWorked !== undefined) {
      if (v?.terms.salary.period !== 'HOUR') throw new BadRequestException('Hours only apply to hourly contracts');
      gross = Math.round(v.terms.salary.amount * dto.hoursWorked);
    }
    if (gross === undefined) throw new BadRequestException('Give the hours worked or the new amount');
    const split = this.calc.calculate(gross, p.rule as CommissionRule);
    if (split.grossAmount === p.grossAmount) throw new BadRequestException({ message: 'Nothing has changed', code: 'NO_CHANGES' });
    const previous = { gross: p.grossAmount, commission: p.commissionAmount, candidateAmount: p.candidateAmount, hoursWorked: p.hoursWorked };
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': 'NOT_DUE' } as never,
      { grossAmount: split.grossAmount, commissionAmount: split.commission, candidateAmount: split.candidateAmount, ...(dto.hoursWorked !== undefined ? { hoursWorked: dto.hoursWorked } : {}), $push: { history: this.entry(admin, p.status, `Amount changed to ${this.money(p, split.grossAmount)}: ${dto.reason}`) } },
      { returnDocument: 'after' },
    );
    await this.events.publish(DomainEvent.PAYMENT_ADJUSTED, {
      actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, reason: dto.reason, previousState: previous,
      newState: { gross: split.grossAmount, commission: split.commission, candidateAmount: split.candidateAmount, hoursWorked: dto.hoursWorked ?? p.hoursWorked }, data: await this.eventData(res!),
    });
    return this.get(id, admin);
  }

  async cancel(id: string, reason: string, admin: AuthUser) {
    const p = await this.load(id, admin);
    if (p.payout.status !== 'NOT_DUE' || p.client.status === 'RECEIVED' || p.status === S.CANCELLED) throw new ConflictException({ message: 'This payment can no longer be cancelled', code: 'BAD_STATE' });
    const res = await this.payments.findOneAndUpdate(
      { _id: p._id, 'payout.status': 'NOT_DUE', status: { $ne: S.CANCELLED } } as never,
      { status: S.CANCELLED, cancelledReason: reason, $push: { history: this.entry(admin, S.CANCELLED, reason) } }, { returnDocument: 'after' },
    );
    if (!res) throw new ConflictException({ message: 'This payment was just updated', code: 'BAD_STATE' });
    await this.events.publish(DomainEvent.PAYMENT_CANCELLED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'Payment', id: p.id }, reason, data: await this.eventData(res) });
    return this.get(id, admin);
  }

  /* ---------------- proof of payment ---------------- */

  /** Attaches a screenshot or PDF to one leg: the company's payment to us, or our payout to the candidate. */
  async attachProof(id: string, leg: 'client' | 'payout', file: StoredUpload, user: AuthUser) {
    const p = await this.load(id, user);
    if (leg === 'client' && !(user.role === Role.ADMIN || user.role === Role.RECRUITER)) throw new ForbiddenException();
    if (leg === 'payout' && user.role !== Role.ADMIN) throw new ForbiddenException();
    if (leg === 'client' && !['MARKED_PAID', 'RECEIVED', 'DISPUTED'].includes(p.client.status)) throw new ConflictException({ message: 'Record the payment first, then attach the proof', code: 'BAD_STATE' });
    if (leg === 'payout' && !['SENT', 'CONFIRMED', 'DISPUTED'].includes(p.payout.status)) throw new ConflictException({ message: 'Record the payout first, then attach the proof', code: 'BAD_STATE' });
    const doc = await this.documents.register(file, user, {
      type: DocumentType.PAYMENT_PROOF, label: `${p.paymentNumber} · ${leg === 'client' ? 'company payment' : 'candidate payout'}`, related: { type: leg === 'client' ? 'PaymentClientProof' : 'PaymentPayoutProof', id: p.id },
    });
    await this.payments.updateOne({ _id: p._id }, { [`${leg}.proofDocumentId`]: new Types.ObjectId(doc.id) });
    await this.events.publish(DomainEvent.DOCUMENT_UPLOADED, { actor: { id: user.id, role: user.role }, entity: { type: 'Payment', id: p.id }, data: { leg, documentId: doc.id } });
    return this.get(id, user);
  }

  /* ---------------- ledger & summary (Admin) ---------------- */

  private async record(p: Payment & { _id: unknown }, type: LedgerType, amount: number, by: AuthUser, reference?: string, memo?: string) {
    await this.ledger.create({
      paymentId: p._id as never, paymentNumber: p.paymentNumber, transactionId: p.transactionId, contractId: p.contractId, contractNumber: p.contractNumber,
      type, amount, currency: p.currency, period: p.period, reference, memo, recordedBy: new Types.ObjectId(by.id),
    });
  }

  async listLedger(q: LedgerQueryDto) {
    const filter: Record<string, unknown> = {};
    if (q.type) filter.type = q.type;
    if (q.period) filter.period = q.period;
    const { items, meta } = await paginate(this.ledger, filter as never, q, { sortable: ['createdAt', 'amount', 'period', 'type'], defaultSort: '-createdAt', searchFields: ['paymentNumber', 'transactionId', 'contractNumber', 'reference'] });
    return { items: items.map((l: any) => this.presentLedger(l)), meta };
  }

  /** Per currency: what is owed to us, what we hold, what we have earned and what we owe candidates. */
  async summary() {
    const rows = await this.payments.aggregate([
      { $match: { status: { $ne: S.CANCELLED } } },
      { $group: {
        _id: { currency: '$currency', status: '$status' }, n: { $sum: 1 }, gross: { $sum: '$grossAmount' }, commission: { $sum: '$commissionAmount' }, candidate: { $sum: '$candidateAmount' },
      } },
    ]);
    const byCurrency: Record<string, any> = {};
    for (const r of rows) {
      const cur = r._id.currency;
      const t = (byCurrency[cur] ??= { currency: cur, awaitingFromCompanies: 0, toConfirm: 0, commissionEarned: 0, commissionPending: 0, payoutsDue: 0, paidOut: 0, disputed: 0 });
      const s = r._id.status as string;
      if (s === S.AWAITING_CLIENT) t.awaitingFromCompanies += r.gross;
      else if (s === S.CLIENT_PAID) { t.toConfirm += r.gross; t.commissionPending += r.commission; }
      else if (s === S.RECEIVED) { t.commissionEarned += r.commission; t.payoutsDue += r.candidate; }
      else if (s === S.PAYOUT_SENT || s === S.COMPLETED) { t.commissionEarned += r.commission; t.paidOut += r.candidate; }
      else if (s === S.DISPUTED) t.disputed += r.gross;
    }
    const monthly = await this.ledger.aggregate([
      { $match: { type: LedgerType.COMMISSION } },
      { $group: { _id: { period: '$period', currency: '$currency' }, commission: { $sum: '$amount' } } }, { $sort: { '_id.period': 1 } },
    ]);
    return { totals: Object.values(byCurrency), commissionByPeriod: monthly.map((m) => ({ period: m._id.period, currency: m._id.currency, commission: m.commission })) };
  }
}
