import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JobRequestStatus, JobStatus, ReviewStatus, Role, UserStatus } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { AuditLog } from '../audit/schemas/audit-log.schema';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { Company } from '../companies/schemas/company.schema';
import { RecruiterCompany } from '../companies/schemas/recruiter-company.schema';
import { Application } from '../applications/schemas/application.schema';
import { CandidateRequest } from '../screening/schemas/candidate-request.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { Interview } from '../interviews/schemas/interview.schema';
import { Job } from '../jobs/schemas/job.schema';
import { JobRequest } from '../jobs/schemas/job-request.schema';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import { User } from '../users/schemas/user.schema';

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Dashboard aggregations. Everything is computed in MongoDB so the frontend never downloads
 * collections to count them. Each role gets one overview endpoint; sections for later modules
 * (jobs, applications, finance...) are added to these payloads as those modules land.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(RecruiterProfile.name) private readonly recruiters: Model<RecruiterProfile>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
    @InjectModel(RecruiterCompany.name) private readonly links: Model<RecruiterCompany>,
    @InjectModel(CandidateProfile.name) private readonly candidates: Model<CandidateProfile>,
    @InjectModel(AuditLog.name) private readonly audit: Model<AuditLog>,
    @InjectModel(JobRequest.name) private readonly jobRequests: Model<JobRequest>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Interview.name) private readonly interviews: Model<Interview>,
    @InjectModel(Contract.name) private readonly contractModel: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly contractVersions: Model<ContractVersion>,
    @InjectModel(Application.name) private readonly applications: Model<Application>,
    @InjectModel(CandidateRequest.name) private readonly candidateRequests: Model<CandidateRequest>,
  ) {}

  async admin(days = 30) {
    const since = new Date(Date.now() - (days - 1) * DAY);
    since.setUTCHours(0, 0, 0, 0);

    const [pendingJobRequests, liveJobs, jobQueue, pendingRecruiters, pendingCompanies, pendingLinks, activeRecruiters, activeCandidates, approvedCompanies, suspendedUsers, signupRows, recruiterQueue, companyQueue, recent] = await Promise.all([
      this.jobRequests.countDocuments({ status: JobRequestStatus.PENDING_ADMIN_REVIEW }),
      this.jobs.countDocuments({ status: JobStatus.PUBLISHED }),
      this.jobRequests.aggregate([
        { $match: { status: JobRequestStatus.PENDING_ADMIN_REVIEW } },
        { $sort: { submittedAt: 1 } }, { $limit: 8 },
        { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'c' } },
        { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'u' } },
        { $project: { _id: 0, id: '$_id', type: { $literal: 'JOB_REQUEST' }, title: { $ifNull: ['$spec.title', 'Untitled'] }, version: 1, subtitle: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, ''] }, ' · ', { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, ''] }] }, submittedAt: 1 } },
      ]),
      this.recruiters.countDocuments({ approvalStatus: ReviewStatus.PENDING_REVIEW }),
      this.companies.countDocuments({ approvalStatus: ReviewStatus.PENDING_REVIEW }),
      this.links.countDocuments({ approvalStatus: ReviewStatus.PENDING_REVIEW }),
      this.recruiters.aggregate([
        { $match: { approvalStatus: ReviewStatus.APPROVED } },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u' } },
        { $match: { 'u.status': UserStatus.ACTIVE, 'u.deletedAt': null } },
        { $count: 'n' },
      ]).then((r) => r[0]?.n ?? 0),
      this.users.countDocuments({ role: Role.CANDIDATE, status: UserStatus.ACTIVE }),
      this.companies.countDocuments({ approvalStatus: ReviewStatus.APPROVED }),
      this.users.countDocuments({ status: UserStatus.SUSPENDED }),
      this.users.aggregate([
        { $match: { createdAt: { $gte: since }, role: { $in: [Role.CANDIDATE, Role.RECRUITER] } } },
        { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, role: '$role' }, n: { $sum: 1 } } },
      ]),
      this.recruiters.aggregate([
        { $match: { approvalStatus: ReviewStatus.PENDING_REVIEW } },
        { $sort: { submittedAt: 1 } }, { $limit: 8 },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
        { $project: { _id: 0, id: '$userId', type: { $literal: 'RECRUITER' }, title: '$u.name', subtitle: '$agencyName', submittedAt: 1 } },
      ]),
      this.companies.aggregate([
        { $match: { approvalStatus: ReviewStatus.PENDING_REVIEW } },
        { $sort: { submittedAt: 1 } }, { $limit: 8 },
        { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'u' } },
        { $project: { _id: 0, id: '$_id', type: { $literal: 'COMPANY' }, title: '$name', subtitle: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, null] }, submittedAt: 1 } },
      ]),
      this.audit.find().sort({ createdAt: -1 }).limit(8).select('actorName actorRole action entityType entityId reason createdAt').lean(),
    ]);

    // Dense daily series so the chart has no gaps.
    const byDay = new Map<string, { candidates: number; recruiters: number }>();
    for (let i = 0; i < days; i++) byDay.set(dayKey(new Date(+since + i * DAY)), { candidates: 0, recruiters: 0 });
    for (const r of signupRows) {
      const slot = byDay.get(r._id.d);
      if (slot) slot[r._id.role === Role.CANDIDATE ? 'candidates' : 'recruiters'] = r.n;
    }

    const FUNNEL: [string, string[]][] = [
      ['applications', []], ['screening', ['ADMIN_REVIEW']], ['adminInterview', ['ADMIN_INTERVIEW']], ['shortlisted', ['ADMIN_SHORTLISTED']], ['sentToRecruiter', ['SENT_TO_RECRUITER']],
      ['recruiterApproved', ['RECRUITER_APPROVED']], ['interview', ['INTERVIEW']], ['selected', ['SELECTED']], ['hired', ['PLACED']],
    ];
    // "Reached this stage at some point", read from the status history so the funnel never shrinks when people move on.
    const [funnelCounts, toReview, recruiterDecisions, candidateRequests] = await Promise.all([
      Promise.all(FUNNEL.map(([, st]) => this.applications.countDocuments((st.length ? { 'statusHistory.status': { $in: st } } : {}) as never))),
      this.applications.countDocuments({ status: { $in: ['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW'] } }),
      this.applications.countDocuments({ status: 'ADMIN_REVIEW', 'recruiterDecision.pending': true }),
      this.candidateRequests.countDocuments({ status: 'PENDING' }),
    ]);
    const funnel = FUNNEL.map(([key], i) => ({ key, count: funnelCounts[i] }));

    const interviewsThisWeek = await this.interviews.countDocuments({ status: 'SCHEDULED', startsAt: { $gte: new Date(), $lte: new Date(Date.now() + 7 * DAY) } } as never);
    const soon = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
    const [activeContracts, expiringContracts, contractApprovals, contractChanges] = await Promise.all([
      this.contractModel.countDocuments({ status: { $in: ['ACTIVE', 'EXPIRING'] } } as never),
      this.contractModel.countDocuments({ status: { $in: ['ACTIVE', 'EXPIRING'] }, endDate: { $gte: new Date().toISOString().slice(0, 10), $lte: soon } } as never),
      this.contractModel.countDocuments({ status: 'PENDING_ADMIN_APPROVAL' } as never),
      this.contractVersions.countDocuments({ status: 'PENDING', kind: 'CHANGE' } as never),
    ]);
    const queue = [...recruiterQueue, ...companyQueue, ...jobQueue]
      .sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt))
      .slice(0, 8);

    return {
      attention: { pendingRecruiters, pendingCompanies, pendingCompanyLinks: pendingLinks, pendingJobRequests, candidatesToReview: toReview, recruiterDecisions, candidateRequests, contractApprovals, contractChanges, expiringContracts, pendingTotal: pendingRecruiters + pendingCompanies + pendingLinks + pendingJobRequests + recruiterDecisions + candidateRequests + contractApprovals + contractChanges },
      totals: { activeRecruiters, activeCandidates, approvedCompanies, suspendedUsers, liveJobs, interviewsThisWeek, activeContracts },
      funnel,
      signups: [...byDay].map(([date, v]) => ({ date, ...v })),
      queue,
      recentActivity: recent.map(({ _id, ...r }) => ({ id: String(_id), ...r })),
    };
  }

  async recruiter(userId: string) {
    const [profile, links, openingRows, liveJobs] = await Promise.all([
      this.recruiters.findOne({ userId }).lean(),
      this.links.find({ recruiterUserId: userId }).populate('companyId', 'name industry location').lean(),
      this.jobRequests.aggregate([{ $match: { recruiterId: new Types.ObjectId(userId) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.jobs.countDocuments({ recruiterId: userId, status: JobStatus.PUBLISHED }),
    ]);
    const openings = Object.fromEntries(openingRows.map((r) => [r._id, r.n]));
    const candRows = await this.applications.aggregate([{ $match: { recruiterId: new Types.ObjectId(userId), status: { $in: ['SENT_TO_RECRUITER', 'RECRUITER_REVIEW', 'RECRUITER_APPROVED', 'INTERVIEW', 'SELECTED', 'CONTRACT', 'PLACED'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const cand = Object.fromEntries(candRows.map((r) => [r._id, r.n]));
    const companies = links.map((l: any) => ({
      id: String(l.companyId?._id), name: l.companyId?.name, industry: l.companyId?.industry, location: l.companyId?.location, approvalStatus: l.approvalStatus,
    }));
    return {
      approval: { status: profile?.approvalStatus ?? ReviewStatus.PENDING_REVIEW, note: profile?.reviewNote ?? null },
      companies,
      candidates: { needsDecision: (cand.SENT_TO_RECRUITER ?? 0) + (cand.RECRUITER_REVIEW ?? 0), approved: cand.RECRUITER_APPROVED ?? 0, interview: cand.INTERVIEW ?? 0, selected: (cand.SELECTED ?? 0) + (cand.CONTRACT ?? 0), placed: cand.PLACED ?? 0 },
      openings: { drafts: openings.DRAFT ?? 0, inReview: openings.PENDING_ADMIN_REVIEW ?? 0, changesRequested: openings.CHANGES_REQUESTED ?? 0, live: liveJobs },
      totals: {
        approvedCompanies: companies.filter((c) => c.approvalStatus === ReviewStatus.APPROVED).length,
        pendingCompanies: companies.filter((c) => c.approvalStatus === ReviewStatus.PENDING_REVIEW).length,
      },
    };
  }

  async candidate(userId: string) {
    const [user, profile] = await Promise.all([this.users.findById(userId).lean(), this.candidates.findOne({ userId }).lean()]);
    const checks: [string, boolean][] = [
      ['Add a headline', !!profile?.headline],
      ['Add your location', !!profile?.location],
      ['List your skills', (profile?.skills?.length ?? 0) > 0],
      ['Add your years of experience', profile?.experienceYears != null],
      ['Set your expected salary', !!profile?.expectedSalary],
      ['Add your notice period', profile?.noticePeriodDays != null],
      ['Add a phone number', !!user?.phone],
      ['Verify your email', !!user?.emailVerified],
    ];
    const done = checks.filter(([, ok]) => ok).length;
    return {
      emailVerified: !!user?.emailVerified,
      profile: { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([label]) => label) },
    };
  }
}
