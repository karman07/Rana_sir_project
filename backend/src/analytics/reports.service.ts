import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { Interview } from '../interviews/schemas/interview.schema';
import { Job } from '../jobs/schemas/job.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Payslip } from '../payslips/schemas/payslip.schema';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import { Salary } from '../salary/schemas/salary.schema';
import { User } from '../users/schemas/user.schema';
import { bucketExpr, bucketLabels, median, pct, resolvePeriod, round1, type PeriodRange } from './periods';

const STAGES: [string, string[]][] = [
  ['applications', []], ['adminInterview', ['ADMIN_INTERVIEW']], ['shortlisted', ['ADMIN_SHORTLISTED']], ['sentToRecruiter', ['SENT_TO_RECRUITER']], ['recruiterApproved', ['RECRUITER_APPROVED']],
  ['interview', ['INTERVIEW']], ['selected', ['SELECTED']], ['hired', ['PLACED']],
];
const DAY = 86_400_000;
const REACHED = (status: string) => ({ 'statusHistory.status': status });
const at = (a: { statusHistory: { status: string; at: Date }[] }, s: string) => a.statusHistory.find((h) => h.status === s)?.at;
const days = (a?: Date, b?: Date) => (a && b ? (+b - +a) / DAY : null);

/** Dense two-or-three-series line data: one row per bucket, zero where nothing happened. */
function series(range: PeriodRange, earliest: Date | null | undefined, keys: string[], rows: { _id: { b: string; k?: string }; n: number }[]) {
  const map = new Map(bucketLabels(range, earliest).map((l) => [l, Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>]));
  for (const r of rows) { const slot = map.get(r._id.b); if (slot) slot[r._id.k ?? keys[0]] = r.n; }
  return [...map.entries()].map(([bucket, v]) => ({ bucket, ...v }));
}

/**
 * Period-based reports for each role. Everything is computed in MongoDB; the pages only draw what they are given.
 * Money stays in minor units with its currency. Each role's report holds only figures that role may see.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Interview.name) private readonly interviews: Model<Interview>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(RecruiterProfile.name) private readonly recruiterProfiles: Model<RecruiterProfile>,
  ) {}

  private cohort(range: PeriodRange, extra: Record<string, unknown> = {}) {
    return { ...extra, ...(range.from ? { createdAt: { $gte: range.from, $lte: range.to } } : {}) };
  }

  private async funnel(filter: Record<string, unknown>) {
    const counts = await Promise.all(STAGES.map(([, st]) => this.apps.countDocuments((st.length ? { ...filter, 'statusHistory.status': { $in: st } } : filter) as never)));
    return STAGES.map(([key], i) => ({ key, count: counts[i] }));
  }

  private async appSeries(range: PeriodRange, filter: Record<string, unknown>) {
    const [created, selected, earliest] = await Promise.all([
      this.apps.aggregate([{ $match: this.cohort(range, filter) }, { $group: { _id: { b: bucketExpr('$createdAt', range.bucket) }, n: { $sum: 1 } } }]),
      this.apps.aggregate([
        { $match: filter }, { $unwind: '$statusHistory' }, { $match: { 'statusHistory.status': 'SELECTED', ...(range.from ? { 'statusHistory.at': { $gte: range.from, $lte: range.to } } : {}) } },
        { $group: { _id: { b: bucketExpr('$statusHistory.at', range.bucket) }, n: { $sum: 1 } } },
      ]),
      range.from ? null : this.apps.findOne(filter as never).sort({ createdAt: 1 }).select('createdAt').lean(),
    ]);
    const rows = [...created.map((r) => ({ _id: { b: r._id.b, k: 'applications' }, n: r.n })), ...selected.map((r) => ({ _id: { b: r._id.b, k: 'selected' }, n: r.n }))];
    return series(range, earliest?.createdAt, ['applications', 'selected'], rows);
  }

  /* ---------------- Admin ---------------- */

  async adminRecruitment(periodKey?: string) {
    const range = resolvePeriod(periodKey);
    const filter = this.cohort(range);
    const [funnel, ts, byStatus, topJobs, interviewRows, selectedApps] = await Promise.all([
      this.funnel(filter),
      this.appSeries(range, {}),
      this.apps.aggregate([{ $match: filter }, { $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      this.apps.aggregate([
        { $match: filter }, { $group: { _id: '$jobId', applications: { $sum: 1 }, selected: { $sum: { $cond: [{ $in: ['SELECTED', '$statusHistory.status'] }, 1, 0] } } } },
        { $sort: { applications: -1 } }, { $limit: 8 },
        { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'j' } }, { $unwind: '$j' },
        { $lookup: { from: 'companies', localField: 'j.companyId', foreignField: '_id', as: 'c' } },
        { $project: { _id: 0, jobId: '$_id', title: '$j.spec.title', jobNumber: '$j.jobNumber', company: { $arrayElemAt: ['$c.name', 0] }, applications: 1, selected: 1 } },
      ]),
      this.interviews.aggregate([{ $match: range.from ? { createdAt: { $gte: range.from, $lte: range.to } } : {} }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.apps.find({ ...filter, 'statusHistory.status': 'SELECTED' } as never).select('createdAt statusHistory').limit(5000).lean(),
    ]);
    const get = (k: string) => funnel.find((f) => f.key === k)?.count ?? 0;
    const rejected = byStatus.find((s) => s._id === 'REJECTED')?.n ?? 0;
    const iv = Object.fromEntries(interviewRows.map((r) => [r._id, r.n]));
    return {
      period: range.key, bucket: range.bucket, funnel, series: ts,
      kpis: {
        applications: get('applications'), shortlisted: get('shortlisted'), interviews: Object.values(iv).reduce((a: number, b) => a + (b as number), 0), selected: get('selected'), hired: get('hired'), rejected,
        applicationToSelected: pct(get('selected'), get('applications')), daysToSelect: round1(median(selectedApps.map((a) => days(a.createdAt, at(a as never, 'SELECTED'))).filter((d): d is number => d !== null))),
      },
      byStatus: byStatus.map((s) => ({ status: s._id, count: s.n })), topJobs,
      interviews: { scheduled: iv.SCHEDULED ?? 0, completed: iv.COMPLETED ?? 0, cancelled: iv.CANCELLED ?? 0, noShow: iv.NO_SHOW ?? 0 },
    };
  }

  async adminFinancial(periodKey?: string, currency?: string) {
    const range = resolvePeriod(periodKey);
    const fromPeriod = range.from ? range.from.toISOString().slice(0, 7) : undefined;
    const base: Record<string, unknown> = { status: { $ne: 'CANCELLED' }, ...(fromPeriod ? { period: { $gte: fromPeriod } } : {}) };
    const byCur = await this.payments.aggregate([{ $match: base }, { $group: { _id: '$currency', gross: { $sum: '$grossAmount' }, n: { $sum: 1 } } }, { $sort: { gross: -1 } }]);
    const currencies = byCur.map((c) => c._id as string);
    const cur = currency && currencies.includes(currency.toUpperCase()) ? currency.toUpperCase() : currencies[0];
    if (!cur) return { period: range.key, bucket: 'month', currency: null, currencies, series: [], kpis: null, performance: null, byStatus: [], contracts: { active: 0, expiringSoon: 0 } };
    const filter = { ...base, currency: cur };
    const [totals, monthly, perf, contractCounts] = await Promise.all([
      this.payments.aggregate([{ $match: filter }, { $group: { _id: '$status', n: { $sum: 1 }, gross: { $sum: '$grossAmount' }, commission: { $sum: '$commissionAmount' }, candidate: { $sum: '$candidateAmount' } } }]),
      this.payments.aggregate([
        { $match: filter },
        { $group: {
          _id: '$period', billed: { $sum: '$grossAmount' },
          commission: { $sum: { $cond: [{ $in: ['$status', ['RECEIVED', 'PAYOUT_SENT', 'COMPLETED']] }, '$commissionAmount', 0] } },
          paidOut: { $sum: { $cond: [{ $in: ['$payout.status', ['SENT', 'CONFIRMED']] }, '$candidateAmount', 0] } },
        } }, { $sort: { _id: 1 } },
      ]),
      this.payments.aggregate([
        { $match: { ...filter, 'client.sentAt': { $exists: true } } },
        { $project: { late: { $max: [0, { $divide: [{ $subtract: ['$client.sentAt', { $dateFromString: { dateString: '$dueDate' } }] }, DAY] }] } } },
        { $group: { _id: null, n: { $sum: 1 }, onTime: { $sum: { $cond: [{ $lte: ['$late', 0] }, 1, 0] } }, avgLate: { $avg: '$late' } } },
      ]),
      Promise.all([this.contracts.countDocuments({ status: { $in: ['ACTIVE', 'EXPIRING'] } }), this.contracts.countDocuments({ status: 'EXPIRING' })]),
    ]);
    const sum = (statuses: string[], f: 'gross' | 'commission' | 'candidate') => totals.filter((t) => statuses.includes(t._id)).reduce((a, t) => a + t[f], 0);
    const overdue = await this.payments.aggregate([{ $match: { ...filter, status: 'AWAITING_CLIENT', dueDate: { $lt: new Date().toISOString().slice(0, 10) } } }, { $group: { _id: null, n: { $sum: 1 }, gross: { $sum: '$grossAmount' } } }]);
    return {
      period: range.key, bucket: 'month', currency: cur, currencies,
      series: monthly.map((m) => ({ bucket: m._id, billed: m.billed, commission: m.commission, paidOut: m.paidOut })),
      kpis: {
        billed: totals.reduce((a, t) => a + t.gross, 0), commission: sum(['RECEIVED', 'PAYOUT_SENT', 'COMPLETED'], 'commission'),
        paidOut: sum(['PAYOUT_SENT', 'COMPLETED'], 'candidate'), awaiting: sum(['AWAITING_CLIENT', 'CLIENT_PAID'], 'gross'), owedToCandidates: sum(['RECEIVED'], 'candidate'), disputed: sum(['DISPUTED'], 'gross'),
        overdueCount: overdue[0]?.n ?? 0, overdueAmount: overdue[0]?.gross ?? 0,
      },
      performance: perf[0] ? { paidPayments: perf[0].n, onTimeRate: pct(perf[0].onTime, perf[0].n), avgDaysLate: round1(perf[0].avgLate) } : null,
      byStatus: totals.map((t) => ({ status: t._id, count: t.n, gross: t.gross })),
      contracts: { active: contractCounts[0], expiringSoon: contractCounts[1] },
    };
  }

  async adminRecruiters(periodKey?: string) {
    const range = resolvePeriod(periodKey);
    const sent = await this.apps.find({ ...this.cohort(range), 'statusHistory.status': 'SENT_TO_RECRUITER' } as never).select('recruiterId createdAt statusHistory').limit(20_000).lean();
    const per = new Map<string, { sent: number; approved: number; returned: number; selected: number; hired: number; decide: number[] }>();
    for (const a of sent) {
      const r = per.get(String(a.recruiterId)) ?? { sent: 0, approved: 0, returned: 0, selected: 0, hired: 0, decide: [] };
      r.sent++;
      const sentAt = at(a as never, 'SENT_TO_RECRUITER'), approvedAt = at(a as never, 'RECRUITER_APPROVED');
      if (approvedAt) { r.approved++; const d = days(sentAt, approvedAt); if (d !== null) r.decide.push(d); }
      if ((a as any).recruiterDecision || (a.statusHistory as any[]).some((h) => h.status === 'ADMIN_REVIEW' && h.role === 'RECRUITER')) r.returned++;
      if (at(a as never, 'SELECTED')) r.selected++;
      if (at(a as never, 'PLACED')) r.hired++;
      per.set(String(a.recruiterId), r);
    }
    const ids = [...per.keys()].map((i) => new Types.ObjectId(i));
    const [users, profiles, liveJobs, activeContracts, overdue] = await Promise.all([
      this.users.find({ _id: { $in: ids } }).select('name email').lean(),
      this.recruiterProfiles.find({ userId: { $in: ids } }).select('userId agencyName').lean(),
      this.jobs.aggregate([{ $match: { recruiterId: { $in: ids }, status: 'PUBLISHED' } }, { $group: { _id: '$recruiterId', n: { $sum: 1 } } }]),
      this.contracts.aggregate([{ $match: { recruiterId: { $in: ids }, status: { $in: ['ACTIVE', 'EXPIRING'] } } }, { $group: { _id: '$recruiterId', n: { $sum: 1 } } }]),
      this.payments.aggregate([{ $match: { recruiterId: { $in: ids }, status: 'AWAITING_CLIENT', dueDate: { $lt: new Date().toISOString().slice(0, 10) } } }, { $group: { _id: '$recruiterId', n: { $sum: 1 } } }]),
    ]);
    const name = new Map(users.map((u) => [String(u._id), u])), agency = new Map(profiles.map((p) => [String(p.userId), p.agencyName]));
    const count = (rows: { _id: unknown; n: number }[]) => new Map(rows.map((r) => [String(r._id), r.n]));
    const jobsM = count(liveJobs), conM = count(activeContracts), odM = count(overdue);
    const rows = [...per.entries()].map(([id, r]) => ({
      recruiterId: id, name: name.get(id)?.name ?? 'Unknown', agency: agency.get(id), sent: r.sent, approved: r.approved, approvalRate: pct(r.approved, r.sent), returned: r.returned,
      selected: r.selected, hired: r.hired, daysToDecide: round1(median(r.decide)), liveJobs: jobsM.get(id) ?? 0, activeContracts: conM.get(id) ?? 0, overduePayments: odM.get(id) ?? 0,
    })).sort((a, b) => b.sent - a.sent);
    return { period: range.key, rows };
  }

  async adminCandidates(periodKey?: string) {
    const range = resolvePeriod(periodKey);
    const cohort = range.from ? { createdAt: { $gte: range.from, $lte: range.to } } : {};
    const [signups, earliest, skills, countries, totals, perCandidate] = await Promise.all([
      this.users.aggregate([{ $match: { role: Role.CANDIDATE, ...cohort } }, { $group: { _id: { b: bucketExpr('$createdAt', range.bucket) }, n: { $sum: 1 } } }]),
      range.from ? null : this.users.findOne({ role: Role.CANDIDATE }).sort({ createdAt: 1 }).select('createdAt').lean(),
      this.profiles.aggregate([{ $unwind: '$skills' }, { $group: { _id: { $toLower: '$skills' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
      this.users.aggregate([{ $match: { role: Role.CANDIDATE, country: { $exists: true, $ne: null } } }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
      this.users.aggregate([{ $match: { role: Role.CANDIDATE } }, { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } }, verified: { $sum: { $cond: ['$emailVerified', 1, 0] } } } }]),
      this.apps.aggregate([{ $match: this.cohort(range) }, { $group: { _id: '$candidateId', n: { $sum: 1 } } }, { $group: { _id: null, candidates: { $sum: 1 }, avg: { $avg: '$n' } } }]),
    ]);
    return {
      period: range.key, bucket: range.bucket, series: series(range, earliest?.createdAt, ['candidates'], signups.map((r) => ({ _id: { b: r._id.b }, n: r.n }))),
      kpis: { total: totals[0]?.total ?? 0, active: totals[0]?.active ?? 0, verifiedRate: pct(totals[0]?.verified ?? 0, totals[0]?.total ?? 0), newInPeriod: signups.reduce((a, r) => a + r.n, 0), applyingCandidates: perCandidate[0]?.candidates ?? 0, avgApplications: round1(perCandidate[0]?.avg ?? null) },
      topSkills: skills.map((s) => ({ skill: s._id as string, count: s.n })), countries: countries.map((c) => ({ country: c._id as string, count: c.n })),
    };
  }

  /* ---------------- Recruiter (own) ---------------- */

  async recruiter(userId: string, periodKey?: string) {
    const range = resolvePeriod(periodKey);
    const mine = { recruiterId: new Types.ObjectId(userId) };
    const filter = this.cohort(range, mine);
    const [funnel, ts, sentApps, jobRows, pay] = await Promise.all([
      this.funnel({ ...filter, 'statusHistory.status': 'SENT_TO_RECRUITER' }),
      this.appSeries(range, mine),
      this.apps.find({ ...filter, 'statusHistory.status': 'SENT_TO_RECRUITER' } as never).select('createdAt statusHistory recruiterDecision').limit(10_000).lean(),
      this.apps.aggregate([
        { $match: filter }, { $group: { _id: '$jobId', applications: { $sum: 1 }, sent: { $sum: { $cond: [{ $in: ['SENT_TO_RECRUITER', '$statusHistory.status'] }, 1, 0] } }, selected: { $sum: { $cond: [{ $in: ['SELECTED', '$statusHistory.status'] }, 1, 0] } } } },
        { $sort: { applications: -1 } }, { $limit: 10 },
        { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'j' } }, { $unwind: '$j' },
        { $project: { _id: 0, jobId: '$_id', title: '$j.spec.title', jobNumber: '$j.jobNumber', applications: 1, sent: 1, selected: 1 } },
      ]),
      // The company side only: what is owed, never the commission or the candidate's share.
      this.payments.aggregate([{ $match: { ...mine, status: { $ne: 'CANCELLED' } } }, { $group: { _id: { currency: '$currency', status: '$status' }, gross: { $sum: '$grossAmount' }, n: { $sum: 1 } } }]),
    ]);
    const decided = sentApps.filter((a) => at(a as never, 'RECRUITER_APPROVED') || (a as any).recruiterDecision);
    const approved = sentApps.filter((a) => at(a as never, 'RECRUITER_APPROVED')).length;
    const wait = sentApps.map((a) => days(at(a as never, 'SENT_TO_RECRUITER'), at(a as never, 'RECRUITER_APPROVED'))).filter((d): d is number => d !== null);
    const owed = new Map<string, { currency: string; due: number; paid: number }>();
    for (const r of pay) {
      const cur = r._id.currency as string;
      const row = owed.get(cur) ?? { currency: cur, due: 0, paid: 0 };
      if (['AWAITING_CLIENT', 'CLIENT_PAID', 'DISPUTED'].includes(r._id.status)) row.due += r.gross; else row.paid += r.gross;
      owed.set(cur, row);
    }
    return {
      period: range.key, bucket: range.bucket, funnel: funnel.filter((f) => f.key !== 'shortlisted' && f.key !== 'adminInterview'), series: ts,
      kpis: { received: sentApps.length, decided: decided.length, approved, approvalRate: pct(approved, sentApps.length), daysToDecide: round1(median(wait)), selected: funnel.find((f) => f.key === 'selected')?.count ?? 0, hired: funnel.find((f) => f.key === 'hired')?.count ?? 0 },
      jobs: jobRows, payments: [...owed.values()],
    };
  }

  /* ---------------- Candidate (own) ---------------- */

  async candidate(userId: string, periodKey?: string) {
    const range = resolvePeriod(periodKey);
    const mine = { candidateId: new Types.ObjectId(userId) };
    const filter = this.cohort(range, mine);
    const [byStatus, created, earliest, interviews, apps, earned, upcoming, contracts] = await Promise.all([
      this.apps.aggregate([{ $match: filter }, { $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      this.apps.aggregate([{ $match: filter }, { $group: { _id: { b: bucketExpr('$createdAt', range.bucket) }, n: { $sum: 1 } } }]),
      range.from ? null : this.apps.findOne(mine as never).sort({ createdAt: 1 }).select('createdAt').lean(),
      this.interviews.aggregate([{ $match: { candidateId: new Types.ObjectId(userId), ...(range.from ? { createdAt: { $gte: range.from, $lte: range.to } } : {}) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.apps.find(filter as never).select('createdAt statusHistory').limit(5000).lean(),
      // Their own pay only: the net amounts on their payslips.
      this.payslips.aggregate([
        { $match: { candidateId: new Types.ObjectId(userId), ...(range.from ? { period: { $gte: range.from.toISOString().slice(0, 7) } } : {}) } },
        { $group: { _id: { b: '$period', currency: '$currency' }, net: { $sum: '$netPay' } } }, { $sort: { '_id.b': 1 } },
      ]),
      this.salaries.aggregate([{ $match: { candidateId: new Types.ObjectId(userId), status: { $in: ['UPCOMING', 'PENDING', 'PROCESSING', 'DELAYED'] } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
      this.contracts.aggregate([{ $match: { candidateId: new Types.ObjectId(userId) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const first = apps.map((a) => days(a.createdAt, a.statusHistory.find((h: any) => h.status !== 'APPLIED')?.at)).filter((d): d is number => d !== null);
    const iv = Object.fromEntries(interviews.map((r) => [r._id, r.n])) as Record<string, number>;
    const currencies = [...new Set(earned.map((e) => e._id.currency as string))];
    return {
      period: range.key, bucket: range.bucket, series: series(range, earliest?.createdAt, ['applications'], created.map((r) => ({ _id: { b: r._id.b }, n: r.n }))),
      byStatus: byStatus.map((s) => ({ status: s._id, count: s.n })),
      kpis: { applications: byStatus.reduce((a, s) => a + s.n, 0), interviews: Object.values(iv).reduce((a, b) => a + b, 0), completedInterviews: iv.COMPLETED ?? 0, daysToFirstResponse: round1(median(first)), activeContracts: contracts.filter((c) => ['ACTIVE', 'EXPIRING'].includes(c._id)).reduce((a, c) => a + c.n, 0) },
      earnings: currencies.map((cur) => ({ currency: cur, total: earned.filter((e) => e._id.currency === cur).reduce((a, e) => a + e.net, 0), months: earned.filter((e) => e._id.currency === cur).map((e) => ({ bucket: e._id.b as string, net: e.net as number })) })),
      upcoming: upcoming.map((u) => ({ currency: u._id as string, amount: u.amount as number, count: u.n as number })),
    };
  }
}
