import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import type { AuthUser } from '../auth/decorators';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { Company } from '../companies/schemas/company.schema';
import { RecruiterCompany } from '../companies/schemas/recruiter-company.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { RECRUITER_VISIBLE } from '../documents/documents.service';
import { Job } from '../jobs/schemas/job.schema';
import { JobRequest } from '../jobs/schemas/job-request.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Payslip } from '../payslips/schemas/payslip.schema';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import { Salary } from '../salary/schemas/salary.schema';
import { User } from '../users/schemas/user.schema';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oid = (id: string) => new Types.ObjectId(id);

export interface SearchHit { id: string; title: string; subtitle?: string; href: string }
export interface SearchGroup { type: string; label: string; items: SearchHit[] }

/** Profile pages for recruiters and companies (Admin), and one search across everything a person is allowed to see. */
@Injectable()
export class DirectoryService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(RecruiterProfile.name) private readonly recruiters: Model<RecruiterProfile>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
    @InjectModel(RecruiterCompany.name) private readonly links: Model<RecruiterCompany>,
    @InjectModel(CandidateProfile.name) private readonly candidates: Model<CandidateProfile>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(JobRequest.name) private readonly jobRequests: Model<JobRequest>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
  ) {}

  /* ---------------- profile pages ---------------- */

  async recruiterProfile(userId: string) {
    const user = await this.users.findOne({ _id: userId, role: Role.RECRUITER }).lean();
    const profile = user ? await this.recruiters.findOne({ userId: user._id }).lean() : null;
    if (!user || !profile) throw new NotFoundException('Recruiter not found');
    const mine = { recruiterId: user._id };
    const today = new Date().toISOString().slice(0, 10);
    const [links, jobs, jobCounts, sent, activeContracts, overdue, billed, createdBy] = await Promise.all([
      this.links.find({ recruiterUserId: user._id }).populate('companyId', 'name location industry approvalStatus logoUrl').lean(),
      this.jobs.find(mine).sort({ createdAt: -1 }).limit(10).select('jobNumber spec.title status publishedAt').lean(),
      this.apps.aggregate([{ $match: mine }, { $group: { _id: '$jobId', n: { $sum: 1 } } }]),
      this.apps.aggregate([{ $match: { ...mine, 'statusHistory.status': 'SENT_TO_RECRUITER' } }, { $group: { _id: null, sent: { $sum: 1 }, selected: { $sum: { $cond: [{ $in: ['SELECTED', '$statusHistory.status'] }, 1, 0] } }, hired: { $sum: { $cond: [{ $in: ['PLACED', '$statusHistory.status'] }, 1, 0] } } } }]),
      this.contracts.countDocuments({ ...mine, status: { $in: ['ACTIVE', 'EXPIRING'] } } as never),
      this.payments.countDocuments({ ...mine, status: 'AWAITING_CLIENT', dueDate: { $lt: today } } as never),
      this.payments.aggregate([{ $match: { ...mine, status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$currency', gross: { $sum: '$grossAmount' }, commission: { $sum: { $cond: [{ $in: ['$status', ['RECEIVED', 'PAYOUT_SENT', 'COMPLETED']] }, '$commissionAmount', 0] } } } }]),
      profile.createdByAdmin ? this.users.findById(profile.createdByAdmin).select('name').lean() : null,
    ]);
    const perJob = new Map(jobCounts.map((j) => [String(j._id), j.n]));
    return {
      id: String(user._id),
      user: { name: user.name, email: user.email, phone: user.phone, country: user.country, status: user.status, emailVerified: user.emailVerified, createdAt: (user as any).createdAt, lastLoginAt: (user as any).lastLoginAt },
      profile: { agencyName: profile.agencyName, approvalStatus: profile.approvalStatus, reviewNote: profile.reviewNote, submittedAt: profile.submittedAt, reviewedAt: profile.reviewedAt, createdByAdmin: createdBy?.name },
      stats: { totalJobs: await this.jobs.countDocuments(mine as never), liveJobs: await this.jobs.countDocuments({ ...mine, status: 'PUBLISHED' } as never), candidatesSent: sent[0]?.sent ?? 0, selected: sent[0]?.selected ?? 0, hired: sent[0]?.hired ?? 0, activeContracts, overduePayments: overdue },
      // The platform's own view: Admin sees the commission its recruiters generate.
      money: billed.map((b) => ({ currency: b._id as string, billed: b.gross as number, commission: b.commission as number })),
      companies: links.map((l: any) => ({ id: String(l.companyId?._id), name: l.companyId?.name, location: l.companyId?.location, industry: l.companyId?.industry, companyStatus: l.companyId?.approvalStatus, linkStatus: l.approvalStatus })),
      jobs: jobs.map((j: any) => ({ id: String(j._id), requestId: String(j.jobRequestId ?? ''), jobNumber: j.jobNumber, title: j.spec?.title, status: j.status, applications: perJob.get(String(j._id)) ?? 0 })),
    };
  }

  async companyProfile(id: string) {
    const c = await this.companies.findById(id).lean();
    if (!c) throw new NotFoundException('Company not found');
    const mine = { companyId: c._id };
    const [links, jobs, jobCounts, apps, contractRows, billed, createdBy] = await Promise.all([
      this.links.find({ companyId: c._id }).populate('recruiterUserId', 'name email').lean(),
      this.jobs.find(mine).sort({ createdAt: -1 }).limit(10).select('jobNumber spec.title status').lean(),
      this.apps.aggregate([{ $match: mine }, { $group: { _id: '$jobId', n: { $sum: 1 } } }]),
      this.apps.aggregate([{ $match: mine }, { $group: { _id: null, applications: { $sum: 1 }, selected: { $sum: { $cond: [{ $in: ['SELECTED', '$statusHistory.status'] }, 1, 0] } }, hired: { $sum: { $cond: [{ $in: ['PLACED', '$statusHistory.status'] }, 1, 0] } } } }]),
      this.contracts.aggregate([{ $match: mine }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.payments.aggregate([{ $match: { ...mine, status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$currency', billed: { $sum: '$grossAmount' }, outstanding: { $sum: { $cond: [{ $in: ['$status', ['AWAITING_CLIENT', 'CLIENT_PAID', 'DISPUTED']] }, '$grossAmount', 0] } } } }]),
      c.createdBy ? this.users.findById(c.createdBy).select('name').lean() : null,
    ]);
    const perJob = new Map(jobCounts.map((j) => [String(j._id), j.n]));
    const by = Object.fromEntries(contractRows.map((r) => [r._id, r.n]));
    return {
      id: String(c._id),
      company: { name: c.name, industry: c.industry, website: c.website, location: c.location, country: c.country, logoUrl: c.logoUrl, approvalStatus: c.approvalStatus, reviewNote: c.reviewNote, submittedAt: c.submittedAt, reviewedAt: c.reviewedAt, createdBy: createdBy?.name, createdAt: (c as any).createdAt },
      stats: { jobs: await this.jobs.countDocuments(mine as never), liveJobs: await this.jobs.countDocuments({ ...mine, status: 'PUBLISHED' } as never), applications: apps[0]?.applications ?? 0, selected: apps[0]?.selected ?? 0, hired: apps[0]?.hired ?? 0, activeContracts: (by.ACTIVE ?? 0) + (by.EXPIRING ?? 0), contracts: Object.values(by).reduce((a: number, b) => a + (b as number), 0) },
      money: billed.map((b) => ({ currency: b._id as string, billed: b.billed as number, outstanding: b.outstanding as number })),
      recruiters: links.map((l: any) => ({ id: String(l.recruiterUserId?._id), name: l.recruiterUserId?.name, email: l.recruiterUserId?.email, linkStatus: l.approvalStatus })),
      jobs: jobs.map((j: any) => ({ id: String(j._id), jobNumber: j.jobNumber, title: j.spec?.title, status: j.status, applications: perJob.get(String(j._id)) ?? 0 })),
    };
  }

  /* ---------------- search ---------------- */

  async search(rawQuery: string, user: AuthUser): Promise<{ query: string; groups: SearchGroup[] }> {
    const q = (rawQuery ?? '').trim().slice(0, 60);
    if (q.length < 2) return { query: q, groups: [] };
    const re = new RegExp(esc(q), 'i');
    const take = 5;
    const groups: SearchGroup[] = [];
    const push = (type: string, label: string, items: SearchHit[]) => { if (items.length) groups.push({ type, label, items }); };
    const A = user.role === Role.ADMIN, R = user.role === Role.RECRUITER, C = user.role === Role.CANDIDATE;
    const role = user.role.toLowerCase();
    const me = oid(user.id);

    // Jobs. Admin and recruiters manage job requests (drafts and pending ones included); candidates see only published jobs.
    if (C) {
      const rows = await this.jobs.find({ status: 'PUBLISHED', $or: [{ jobNumber: re }, { 'spec.title': re }] } as never).sort({ createdAt: -1 }).limit(take).select('jobNumber spec.title spec.location').lean();
      push('job', 'Jobs', rows.map((j: any) => ({ id: String(j._id), title: j.spec?.title ?? j.jobNumber, subtitle: `${j.jobNumber}${j.spec?.location ? ` · ${j.spec.location}` : ''}`, href: `/candidate/jobs/${j._id}` })));
    } else {
      const own = R ? { recruiterId: me } : {};
      const [reqs, live] = await Promise.all([
        this.jobRequests.find({ ...own, $or: [{ requestNumber: re }, { 'spec.title': re }] } as never).sort({ createdAt: -1 }).limit(take).select('requestNumber spec.title spec.location status').lean(),
        this.jobs.find({ ...own, jobNumber: re } as never).sort({ createdAt: -1 }).limit(take).select('jobNumber spec.title spec.location jobRequestId').lean(),
      ]);
      const href = (id: unknown) => (A ? `/admin/job-requests/${id}` : `/recruiter/jobs/${id}`);
      const seen = new Set<string>();
      const items: SearchHit[] = [];
      for (const j of live as any[]) { const h = href(j.jobRequestId); if (!seen.has(h)) { seen.add(h); items.push({ id: String(j._id), title: j.spec?.title ?? j.jobNumber, subtitle: `${j.jobNumber}${j.spec?.location ? ` · ${j.spec.location}` : ''}`, href: h }); } }
      for (const r of reqs as any[]) { const h = href(r._id); if (!seen.has(h)) { seen.add(h); items.push({ id: String(r._id), title: r.spec?.title ?? r.requestNumber, subtitle: `${r.requestNumber} · ${String(r.status).toLowerCase().replace(/_/g, ' ')}`, href: h }); } }
      push('job', 'Jobs', items.slice(0, take));
    }
    if (A) {
      const [cand, rec, comp] = await Promise.all([
        this.users.find({ role: Role.CANDIDATE, $or: [{ name: re }, { email: re }] }).limit(take).select('name email').lean(),
        this.users.find({ role: Role.RECRUITER, $or: [{ name: re }, { email: re }] }).limit(take).select('name email').lean(),
        this.companies.find({ name: re }).limit(take).select('name location').lean(),
      ]);
      push('candidate', 'Candidates', cand.map((u) => ({ id: String(u._id), title: u.name, subtitle: u.email, href: `/admin/candidates/${u._id}` })));
      push('recruiter', 'Recruiters', rec.map((u) => ({ id: String(u._id), title: u.name, subtitle: u.email, href: `/admin/recruiters/${u._id}` })));
      push('company', 'Companies', comp.map((c: any) => ({ id: String(c._id), title: c.name, subtitle: c.location, href: `/admin/companies/${c._id}` })));
    }
    // Applications (by number, or the job title for a candidate's own)
    {
      const filter: Record<string, unknown> = { applicationNumber: re };
      if (C) filter.candidateId = me;
      if (R) { filter.recruiterId = me; filter.status = { $in: RECRUITER_VISIBLE }; }
      const rows = await this.apps.find(filter as never).sort({ createdAt: -1 }).limit(take).populate('candidateId', 'name').populate('jobId', 'spec.title').select('applicationNumber status candidateId jobId').lean();
      push('application', 'Applications', rows.map((a: any) => ({ id: String(a._id), title: `${a.applicationNumber} · ${C ? a.jobId?.spec?.title : a.candidateId?.name}`, subtitle: `${C ? '' : `${a.jobId?.spec?.title} · `}${String(a.status).toLowerCase().replace(/_/g, ' ')}`, href: `/${role}/${A ? 'applications' : C ? 'applications' : 'candidates'}/${a._id}` })));
    }
    // Contracts, payments, salary, payslips by their numbers
    const scope: Record<string, unknown> = A ? {} : R ? { recruiterId: me } : { candidateId: me };
    {
      const rows = await this.contracts.find({ ...scope, contractNumber: re, ...(C ? { status: { $in: ['PENDING_CANDIDATE_APPROVAL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'] } } : {}) } as never).sort({ createdAt: -1 }).limit(take).select('contractNumber status').lean();
      push('contract', 'Contracts', rows.map((c: any) => ({ id: String(c._id), title: c.contractNumber, subtitle: String(c.status).toLowerCase().replace(/_/g, ' '), href: `/${role}/contracts/${c._id}` })));
    }
    {
      const rows = await this.payments.find({ ...scope, $or: [{ paymentNumber: re }, ...(A ? [{ transactionId: re }] : [])], ...(C ? { 'payout.status': { $in: ['PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'] } } : {}) } as never).sort({ period: -1 }).limit(take).select('paymentNumber period contractNumber').lean();
      push('payment', 'Payments', rows.map((p: any) => ({ id: String(p._id), title: p.paymentNumber, subtitle: `${p.contractNumber} · ${p.period}`, href: `/${role}/payments/${p._id}` })));
    }
    {
      const rows = await this.salaries.find({ ...scope, salaryNumber: re } as never).sort({ period: -1 }).limit(take).select('salaryNumber period contractNumber').lean();
      push('salary', 'Salary', rows.map((s: any) => ({ id: String(s._id), title: s.salaryNumber, subtitle: `${s.contractNumber} · ${s.period}`, href: `/${role}/salary/${s._id}` })));
    }
    if (!R) {
      const rows = await this.payslips.find({ ...(A ? {} : { candidateId: me }), payslipNumber: re } as never).sort({ period: -1 }).limit(take).select('payslipNumber period data.jobTitle').lean();
      push('payslip', 'Payslips', rows.map((p: any) => ({ id: String(p._id), title: p.payslipNumber, subtitle: `${p.data?.jobTitle ?? ''} · ${p.period}`, href: `/${role}/payslips/${p._id}` })));
    }
    return { query: q, groups };
  }

}
