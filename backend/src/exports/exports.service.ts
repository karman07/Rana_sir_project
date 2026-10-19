import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role, fromMinor } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import { resolvePeriod } from '../analytics/periods';
import { Application } from '../applications/schemas/application.schema';
import type { AuthUser } from '../auth/decorators';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { EventBusService } from '../common/events/event-bus.service';
import { Company } from '../companies/schemas/company.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { CommissionCalculationService } from '../contracts/commission-calculation.service';
import { RECRUITER_VISIBLE } from '../documents/documents.service';
import { Job } from '../jobs/schemas/job.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Payslip } from '../payslips/schemas/payslip.schema';
import { Salary } from '../salary/schemas/salary.schema';
import { User } from '../users/schemas/user.schema';
import { toCsv, toXlsx, type Column, type Row } from './export-format';

export const DATASETS = ['candidates', 'applications', 'jobs', 'payments', 'commissions', 'salary', 'payslips', 'contracts'] as const;
export type Dataset = (typeof DATASETS)[number];
/** Spreadsheets are for working with data, not for dumping the database: a hard ceiling keeps one click from taking the server down. */
export const MAX_ROWS = 50_000;

const ACCESS: Record<Dataset, Role[]> = {
  candidates: [Role.ADMIN], applications: [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE], jobs: [Role.ADMIN, Role.RECRUITER],
  payments: [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE], commissions: [Role.ADMIN], salary: [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE],
  payslips: [Role.ADMIN, Role.CANDIDATE], contracts: [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE],
};

interface Query { period?: string; status?: string }
const oid = (id: string) => new Types.ObjectId(id);
const money = (n: number | undefined | null, cur?: string) => (n === undefined || n === null || !cur ? undefined : fromMinor(n, cur));
const ruleText = (r?: { type?: string; basisPoints?: number; amount?: number }, cur?: string) => (!r ? '' : r.type === 'PERCENT' ? `${((r.basisPoints ?? 0) / 100).toFixed((r.basisPoints ?? 0) % 100 ? 2 : 0)}%` : `${cur ?? ''} ${money(r.amount, cur)} fixed`.trim());
const BASIS: Record<string, string> = { HOUR: 'Per hour', MONTH: 'Per month', YEAR: 'Per year', FIXED: 'Fixed' };

@Injectable()
export class ExportsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    private readonly calc: CommissionCalculationService,
    private readonly events: EventBusService,
  ) {}

  /** Builds the file for one dataset, as the person asking is allowed to see it, and records that it was exported. */
  async export(dataset: string, format: 'csv' | 'xlsx', q: Query, user: AuthUser) {
    if (!(DATASETS as readonly string[]).includes(dataset)) throw new BadRequestException({ message: 'Unknown dataset', code: 'UNKNOWN_DATASET' });
    const ds = dataset as Dataset;
    if (!ACCESS[ds].includes(user.role)) throw new ForbiddenException('You cannot export this');
    const { columns, rows } = await this.build(ds, q, user);
    const truncated = rows.length > MAX_ROWS;
    const used = truncated ? rows.slice(0, MAX_ROWS) : rows;
    const body = format === 'xlsx' ? await toXlsx(ds[0].toUpperCase() + ds.slice(1), columns, used) : toCsv(columns, used);
    await this.events.publish(DomainEvent.DATA_EXPORTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Export', id: ds }, data: { dataset: ds, format, rows: used.length, truncated, period: q.period ?? 'all', status: q.status },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      body, rows: used.length, truncated, filename: `${ds}-${stamp}.${format}`,
      mime: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
    };
  }

  private window(q: Query, field = 'createdAt') {
    const r = resolvePeriod(q.period === 'all' || !q.period ? 'all' : q.period);
    return r.from ? { [field]: { $gte: r.from } } : {};
  }

  private async nameMap(model: Model<any>, ids: unknown[], fields = 'name') {
    const unique = [...new Set(ids.filter(Boolean).map(String))].map(oid);
    const rows = unique.length ? await model.find({ _id: { $in: unique } }).select(fields).lean() : [];
    return new Map(rows.map((r: any) => [String(r._id), r]));
  }

  private async build(ds: Dataset, q: Query, user: AuthUser): Promise<{ columns: Column[]; rows: Row[] }> {
    switch (ds) {
      case 'candidates': return this.candidatesSet(q);
      case 'applications': return this.applicationsSet(q, user);
      case 'jobs': return this.jobsSet(q, user);
      case 'payments': return this.paymentsSet(q, user);
      case 'commissions': return this.commissionsSet(q);
      case 'salary': return this.salarySet(q, user);
      case 'payslips': return this.payslipsSet(q, user);
      case 'contracts': return this.contractsSet(q, user);
    }
  }

  /* ---------------- datasets ---------------- */

  private async candidatesSet(q: Query) {
    const users = await this.users.find({ role: Role.CANDIDATE, ...this.window(q) }).sort({ createdAt: -1 }).limit(MAX_ROWS + 1).lean();
    const prof = new Map((await this.profiles.find({ userId: { $in: users.map((u) => u._id) } }).lean()).map((p) => [String(p.userId), p]));
    const columns: Column[] = [
      { key: 'name', label: 'Name' }, { key: 'email', label: 'Email', width: 30 }, { key: 'phone', label: 'Phone' }, { key: 'country', label: 'Country', width: 10 }, { key: 'headline', label: 'Headline', width: 30 },
      { key: 'location', label: 'Location' }, { key: 'skills', label: 'Skills', width: 36 }, { key: 'experience', label: 'Experience (years)', type: 'number' }, { key: 'expected', label: 'Expected pay', type: 'money' },
      { key: 'currency', label: 'Currency', width: 9 }, { key: 'notice', label: 'Notice (days)', type: 'number' }, { key: 'status', label: 'Account status' }, { key: 'verified', label: 'Email verified' }, { key: 'joined', label: 'Signed up', type: 'date' },
    ];
    const rows = users.map((u) => {
      const p = prof.get(String(u._id)) as any;
      return {
        name: u.name, email: u.email, phone: u.phone, country: u.country, headline: p?.headline, location: p?.location, skills: (p?.skills ?? []).join('; '), experience: p?.experienceYears,
        expected: money(p?.expectedSalary?.amount, p?.expectedSalary?.currency), currency: p?.expectedSalary?.currency, notice: p?.noticePeriodDays, status: u.status, verified: u.emailVerified, joined: (u as any).createdAt,
      };
    });
    return { columns, rows };
  }

  private async applicationsSet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...this.window(q) };
    if (user.role === Role.CANDIDATE) filter.candidateId = oid(user.id);
    if (user.role === Role.RECRUITER) { filter.recruiterId = oid(user.id); filter.status = { $in: RECRUITER_VISIBLE }; }
    if (q.status) filter.status = q.status;
    const items = await this.apps.find(filter as never).sort({ createdAt: -1 }).limit(MAX_ROWS + 1).lean();
    const [cand, jobs] = await Promise.all([this.nameMap(this.users, items.map((a) => a.candidateId), 'name email'), this.nameMap(this.jobs, items.map((a) => a.jobId), 'jobNumber spec.title companyId')]);
    const comp = await this.nameMap(this.companies, [...jobs.values()].map((j: any) => j.companyId), 'name');
    const isCand = user.role === Role.CANDIDATE, isAdmin = user.role === Role.ADMIN;
    const columns: Column[] = [
      { key: 'number', label: 'Application #', width: 14 }, ...(isCand ? [] : [{ key: 'candidate', label: 'Candidate' }, { key: 'email', label: 'Email', width: 30 }] as Column[]),
      { key: 'job', label: 'Job', width: 28 }, { key: 'jobNumber', label: 'Job #', width: 11 }, { key: 'company', label: 'Company' }, { key: 'status', label: 'Status', width: 20 }, { key: 'applied', label: 'Applied on', type: 'date' },
      { key: 'expected', label: 'Expected pay (yearly)', type: 'money' }, { key: 'currency', label: 'Currency', width: 9 }, { key: 'notice', label: 'Notice (days)', type: 'number' },
      ...(isAdmin ? [{ key: 'score', label: 'Admin score', type: 'number' }] as Column[] : []), { key: 'updated', label: 'Last update', type: 'date' },
    ];
    const rows = items.map((a: any) => {
      const j = jobs.get(String(a.jobId)) as any, c = cand.get(String(a.candidateId)) as any;
      return {
        number: a.applicationNumber, candidate: c?.name, email: c?.email, job: j?.spec?.title, jobNumber: j?.jobNumber, company: (comp.get(String(j?.companyId)) as any)?.name, status: a.status,
        applied: a.createdAt, expected: money(a.expectedSalary?.amount, a.expectedSalary?.currency), currency: a.expectedSalary?.currency, notice: a.noticePeriodDays, score: a.adminScore, updated: a.updatedAt,
      };
    });
    return { columns, rows };
  }

  private async jobsSet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...this.window(q) };
    if (user.role === Role.RECRUITER) filter.recruiterId = oid(user.id);
    if (q.status) filter.status = q.status;
    const items = await this.jobs.find(filter as never).sort({ createdAt: -1 }).limit(MAX_ROWS + 1).populate('companyId', 'name').lean();
    const counts = await this.apps.aggregate([{ $match: { jobId: { $in: items.map((j) => j._id) } } }, { $group: { _id: '$jobId', n: { $sum: 1 } } }]);
    const cm = new Map(counts.map((c) => [String(c._id), c.n]));
    const rec = user.role === Role.ADMIN ? await this.nameMap(this.users, items.map((j) => j.recruiterId)) : new Map();
    const columns: Column[] = [
      { key: 'number', label: 'Job #', width: 11 }, { key: 'title', label: 'Title', width: 30 }, { key: 'company', label: 'Company' }, ...(user.role === Role.ADMIN ? [{ key: 'recruiter', label: 'Recruiter' }] as Column[] : []),
      { key: 'status', label: 'Status' }, { key: 'type', label: 'Type' }, { key: 'mode', label: 'Work mode' }, { key: 'location', label: 'Location' }, { key: 'openings', label: 'Openings', type: 'number' },
      { key: 'basis', label: 'Pay basis' }, { key: 'min', label: 'Pay from', type: 'money' }, { key: 'max', label: 'Pay to', type: 'money' }, { key: 'currency', label: 'Currency', width: 9 }, { key: 'hours', label: 'Hours / week', type: 'number' },
      { key: 'applications', label: 'Applications', type: 'number' }, { key: 'published', label: 'Published on', type: 'date' },
    ];
    const rows = items.map((j: any) => {
      const c = j.spec?.compensation;
      return {
        number: j.jobNumber, title: j.spec?.title, company: j.companyId?.name, recruiter: (rec.get(String(j.recruiterId)) as any)?.name, status: j.status, type: j.spec?.employmentType, mode: j.spec?.workMode, location: j.spec?.location,
        openings: j.spec?.openings, basis: BASIS[c?.payBasis ?? 'MONTH'], min: money(c?.salaryMin, c?.currency), max: money(c?.salaryMax, c?.currency), currency: c?.currency, hours: c?.hoursPerWeek,
        applications: cm.get(String(j._id)) ?? 0, published: j.publishedAt,
      };
    });
    return { columns, rows };
  }

  private async paymentsSet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...(q.period && q.period !== 'all' ? this.window(q) : {}) };
    if (user.role === Role.RECRUITER) filter.recruiterId = oid(user.id);
    if (user.role === Role.CANDIDATE) { filter.candidateId = oid(user.id); filter['payout.status'] = { $in: ['PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'] }; }
    if (q.status) filter.status = q.status;
    const items = await this.payments.find(filter as never).sort({ period: -1, createdAt: -1 }).limit(MAX_ROWS + 1).lean();
    const [cand, rec, jobs] = await Promise.all([this.nameMap(this.users, items.map((p) => p.candidateId)), this.nameMap(this.users, items.map((p) => p.recruiterId)), this.nameMap(this.jobs, items.map((p) => p.jobId), 'spec.title')]);
    const A = user.role === Role.ADMIN, R = user.role === Role.RECRUITER, C = user.role === Role.CANDIDATE;
    const columns: Column[] = [
      { key: 'number', label: 'Payment #', width: 12 }, ...(A ? [{ key: 'txn', label: 'Transaction ID', width: 22 }] as Column[] : []), { key: 'contract', label: 'Contract', width: 11 },
      ...(C ? [] : [{ key: 'candidate', label: 'Candidate' }] as Column[]), ...(A ? [{ key: 'recruiter', label: 'Recruiter' }] as Column[] : []), { key: 'job', label: 'Job', width: 26 }, { key: 'period', label: 'Period', width: 10 },
      ...(C ? [] : [{ key: 'due', label: 'Due', type: 'date' }] as Column[]), { key: 'currency', label: 'Currency', width: 9 },
      ...(A ? [{ key: 'gross', label: 'Company pays', type: 'money' }, { key: 'commission', label: 'Commission', type: 'money' }, { key: 'candidateAmount', label: 'Candidate receives', type: 'money' }] as Column[]
        : R ? [{ key: 'gross', label: 'Amount due', type: 'money' }] as Column[] : [{ key: 'candidateAmount', label: 'Your pay', type: 'money' }] as Column[]),
      { key: 'status', label: 'Status', width: 18 },
      ...((C ? [{ key: 'sentOn', label: 'Sent on', type: 'date' }, { key: 'reference', label: 'Reference' }] : [{ key: 'paidOn', label: 'Company paid on', type: 'date' }, { key: 'reference', label: 'Reference' }, ...(A ? [{ key: 'payoutOn', label: 'Paid out on', type: 'date' }] : [])]) as Column[]),
    ];
    const rows = items.map((p: any) => ({
      number: p.paymentNumber, txn: p.transactionId, contract: p.contractNumber, candidate: (cand.get(String(p.candidateId)) as any)?.name, recruiter: (rec.get(String(p.recruiterId)) as any)?.name,
      job: (jobs.get(String(p.jobId)) as any)?.spec?.title, period: p.period, due: p.dueDate ? new Date(`${p.dueDate}T00:00:00Z`) : undefined, currency: p.currency,
      gross: money(p.grossAmount, p.currency), commission: money(p.commissionAmount, p.currency), candidateAmount: money(p.candidateAmount, p.currency),
      status: C ? (p.payout?.status === 'CONFIRMED' ? 'Received' : p.payout?.status === 'SENT' ? 'Sent' : p.payout?.status === 'DISPUTED' ? 'Disputed' : 'Being processed') : p.status,
      sentOn: p.payout?.sentAt, paidOn: p.client?.sentAt, payoutOn: p.payout?.sentAt, reference: C ? p.payout?.reference : p.client?.reference,
    }));
    return { columns, rows };
  }

  private async commissionsSet(q: Query) {
    const items = await this.payments.find({ status: { $ne: 'CANCELLED' }, ...(q.period && q.period !== 'all' ? this.window(q) : {}) } as never).sort({ period: -1 }).limit(MAX_ROWS + 1).lean();
    const [cand, rec] = await Promise.all([this.nameMap(this.users, items.map((p) => p.candidateId)), this.nameMap(this.users, items.map((p) => p.recruiterId))]);
    const columns: Column[] = [
      { key: 'number', label: 'Payment #', width: 12 }, { key: 'contract', label: 'Contract', width: 11 }, { key: 'recruiter', label: 'Recruiter' }, { key: 'candidate', label: 'Candidate' }, { key: 'period', label: 'Period', width: 10 },
      { key: 'currency', label: 'Currency', width: 9 }, { key: 'gross', label: 'Gross', type: 'money' }, { key: 'rule', label: 'Rule', width: 12 }, { key: 'commission', label: 'Commission', type: 'money' },
      { key: 'earned', label: 'Earned (money received)' }, { key: 'status', label: 'Payment status', width: 18 },
    ];
    const rows = items.map((p: any) => ({
      number: p.paymentNumber, contract: p.contractNumber, recruiter: (rec.get(String(p.recruiterId)) as any)?.name, candidate: (cand.get(String(p.candidateId)) as any)?.name, period: p.period, currency: p.currency,
      gross: money(p.grossAmount, p.currency), rule: ruleText(p.rule, p.currency), commission: money(p.commissionAmount, p.currency), earned: ['RECEIVED', 'PAYOUT_SENT', 'COMPLETED'].includes(p.status), status: p.status,
    }));
    return { columns, rows };
  }

  private async salarySet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...(q.period && q.period !== 'all' ? this.window(q) : {}) };
    if (user.role === Role.RECRUITER) filter.recruiterId = oid(user.id);
    if (user.role === Role.CANDIDATE) filter.candidateId = oid(user.id);
    if (q.status) filter.status = q.status;
    const items = await this.salaries.find(filter as never).sort({ period: -1 }).limit(MAX_ROWS + 1).lean();
    const [cand, rec, jobs] = await Promise.all([this.nameMap(this.users, items.map((s) => s.candidateId)), this.nameMap(this.users, items.map((s) => s.recruiterId)), this.nameMap(this.jobs, items.map((s) => s.jobId), 'spec.title')]);
    const A = user.role === Role.ADMIN, R = user.role === Role.RECRUITER, C = user.role === Role.CANDIDATE;
    const columns: Column[] = [
      { key: 'number', label: 'Salary #', width: 11 }, { key: 'contract', label: 'Contract', width: 11 }, ...(C ? [] : [{ key: 'candidate', label: 'Candidate' }] as Column[]), ...(A ? [{ key: 'recruiter', label: 'Recruiter' }] as Column[] : []),
      { key: 'job', label: 'Job', width: 26 }, { key: 'period', label: 'Period', width: 10 }, { key: 'currency', label: 'Currency', width: 9 },
      ...(R ? [{ key: 'gross', label: 'Amount', type: 'money' }] as Column[] : [{ key: 'amount', label: C ? 'Your pay' : 'Candidate pay', type: 'money' }, ...(A ? [{ key: 'gross', label: 'Company amount', type: 'money' }] as Column[] : [])] as Column[]),
      { key: 'hours', label: 'Hours', type: 'number' }, { key: 'payDate', label: 'Expected on', type: 'date' }, { key: 'original', label: 'Originally expected', type: 'date' }, { key: 'status', label: 'Status', width: 14 },
      ...(C ? [] : [{ key: 'delay', label: 'Delay' }] as Column[]),
    ];
    const day = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : undefined);
    const rows = items.map((s: any) => ({
      number: s.salaryNumber, contract: s.contractNumber, candidate: (cand.get(String(s.candidateId)) as any)?.name, recruiter: (rec.get(String(s.recruiterId)) as any)?.name, job: (jobs.get(String(s.jobId)) as any)?.spec?.title,
      period: s.period, currency: s.currency, amount: money(s.amount, s.currency), gross: money(s.grossAmount, s.currency), hours: s.hoursWorked, payDate: day(s.payDate), original: day(s.originalPayDate), status: s.status,
      delay: s.delay?.status && s.delay.status !== 'NONE' ? s.delay.status : '',
    }));
    return { columns, rows };
  }

  private async payslipsSet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...(q.period && q.period !== 'all' ? this.window(q) : {}) };
    if (user.role === Role.CANDIDATE) filter.candidateId = oid(user.id);
    const items = await this.payslips.find(filter as never).sort({ period: -1 }).limit(MAX_ROWS + 1).lean();
    const A = user.role === Role.ADMIN;
    const columns: Column[] = [
      { key: 'number', label: 'Payslip #', width: 12 }, ...(A ? [{ key: 'candidate', label: 'Candidate' }] as Column[] : []), { key: 'contract', label: 'Contract', width: 11 }, { key: 'job', label: 'Role', width: 26 }, { key: 'period', label: 'Period', width: 10 },
      { key: 'currency', label: 'Currency', width: 9 }, { key: 'net', label: 'Net pay', type: 'money' }, { key: 'hours', label: 'Hours', type: 'number' }, { key: 'issued', label: 'Issued on', type: 'date' }, { key: 'method', label: 'Paid by' }, { key: 'reference', label: 'Reference' },
    ];
    const rows = items.map((p: any) => ({
      number: p.payslipNumber, candidate: p.data?.candidate?.name, contract: p.data?.contractNumber, job: p.data?.jobTitle, period: p.period, currency: p.currency, net: money(p.netPay, p.currency), hours: p.data?.hoursWorked,
      issued: p.data?.issuedOn ? new Date(`${p.data.issuedOn}T00:00:00Z`) : undefined, method: p.data?.payment?.method, reference: p.data?.payment?.reference,
    }));
    return { columns, rows };
  }

  private async contractsSet(q: Query, user: AuthUser) {
    const filter: Record<string, unknown> = { ...this.window(q) };
    if (user.role === Role.RECRUITER) filter.recruiterId = oid(user.id);
    if (user.role === Role.CANDIDATE) { filter.candidateId = oid(user.id); filter.status = { $in: ['PENDING_CANDIDATE_APPROVAL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'] }; }
    if (q.status) filter.status = q.status;
    const items = await this.contracts.find(filter as never).sort({ createdAt: -1 }).limit(MAX_ROWS + 1).lean();
    const vers = await this.versions.find({ $or: items.map((c) => ({ contractId: c._id, version: c.currentVersion })) }).lean();
    const vm = new Map(vers.map((v) => [String(v.contractId), v]));
    const [cand, rec, jobs] = await Promise.all([this.nameMap(this.users, items.map((c) => c.candidateId)), this.nameMap(this.users, items.map((c) => c.recruiterId)), this.nameMap(this.jobs, items.map((c) => c.jobId), 'spec.title companyId')]);
    const comp = await this.nameMap(this.companies, [...jobs.values()].map((j: any) => j.companyId), 'name');
    const A = user.role === Role.ADMIN, C = user.role === Role.CANDIDATE;
    const columns: Column[] = [
      { key: 'number', label: 'Contract #', width: 11 }, ...(C ? [] : [{ key: 'candidate', label: 'Candidate' }] as Column[]), ...(A ? [{ key: 'recruiter', label: 'Recruiter' }] as Column[] : []),
      { key: 'company', label: 'Company' }, { key: 'job', label: 'Role', width: 26 }, { key: 'status', label: 'Status', width: 20 }, { key: 'version', label: 'Version', type: 'number' }, { key: 'type', label: 'Type' },
      { key: 'currency', label: 'Currency', width: 9 }, { key: 'pay', label: C ? 'Your pay' : A ? 'Contract rate' : 'Rate', type: 'money' }, { key: 'basis', label: 'Pay basis' }, { key: 'hours', label: 'Hours / week', type: 'number' },
      { key: 'start', label: 'Starts', type: 'date' }, { key: 'end', label: 'Ends', type: 'date' }, ...(A ? [{ key: 'commission', label: 'Commission rule', width: 14 }] as Column[] : []),
    ];
    const day = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : undefined);
    const rows = items.map((c: any) => {
      const v = vm.get(String(c._id)) as any, t = v?.terms, j = jobs.get(String(c.jobId)) as any;
      // A candidate's figure is what they receive, the same everywhere else they see it.
      const pay = t ? (C ? Math.round(t.salary.amount * this.calc.candidateShare(t.salary, t.salary.currency, t.commission)) : t.salary.amount) : undefined;
      return {
        number: c.contractNumber, candidate: (cand.get(String(c.candidateId)) as any)?.name, recruiter: (rec.get(String(c.recruiterId)) as any)?.name, company: (comp.get(String(j?.companyId)) as any)?.name, job: j?.spec?.title,
        status: c.status, version: c.currentVersion, type: t?.employmentType, currency: t?.salary?.currency, pay: money(pay, t?.salary?.currency), basis: BASIS[t?.salary?.period ?? ''], hours: t?.salary?.hoursPerWeek,
        start: day(c.startDate), end: day(c.endDate), commission: ruleText(t?.commission, t?.salary?.currency),
      };
    });
    return { columns, rows };
  }
}
