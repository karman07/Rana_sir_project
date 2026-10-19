import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, DomainEvent, JobStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import { DocumentsService, RECRUITER_VISIBLE } from '../documents/documents.service';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import type { ApplyDto, ListApplicationsQueryDto, TransitionDto } from './dto/application.dto';
import { allowedTransitions, RecruitmentWorkflowService } from './recruitment-workflow.service';
import { JobPricingService } from '../jobs/job-pricing.service';
import { Application } from './schemas/application.schema';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isResumeLabel = (l: string) => /^(resume|cv|curriculum vitae)$/i.test(l.trim());

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    private readonly documents: DocumentsService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly workflow: RecruitmentWorkflowService,
    private readonly pricing: JobPricingService,
  ) {}

  /* ---------------- Apply ---------------- */

  async apply(dto: ApplyDto, user: AuthUser) {
    const job = await this.jobs.findOne({ _id: dto.jobId, status: JobStatus.PUBLISHED }).lean();
    if (!job) throw new NotFoundException({ message: 'This job is no longer accepting applications', code: 'JOB_UNAVAILABLE' });

    if (await this.apps.exists({ candidateId: user.id as never, jobId: dto.jobId as never })) {
      throw new ConflictException({ message: 'You have already applied to this job', code: 'ALREADY_APPLIED' });
    }
    const resume = await this.documents.activeResume(user.id);
    if (!resume) throw new BadRequestException({ message: 'Upload your resume before applying', code: 'RESUME_REQUIRED' });

    // Every document the job asks for (other than the resume itself) must be attached, and must be the candidate's own.
    const required = (job.spec.details?.requiredDocuments ?? []).filter((l) => !isResumeLabel(l));
    const attached = dto.documents ?? [];
    const owned = new Set((await this.documents.ownedByIds(user.id, attached.map((d) => d.documentId))).map((d) => String(d._id)));
    if (attached.some((d) => !owned.has(d.documentId))) throw new BadRequestException({ message: 'One of the attached documents is not yours', code: 'INVALID_DOCUMENT' });
    const missing = required.filter((r) => !attached.some((a) => a.label.trim().toLowerCase() === r.trim().toLowerCase()));
    if (missing.length) throw new BadRequestException({ message: missing.map((m) => `Attach your ${m}`), code: 'DOCUMENTS_REQUIRED' });

    const n = await this.counters.next('application');
    let app;
    try {
      app = await this.apps.create({
        applicationNumber: `APP-${String(n).padStart(5, '0')}`,
        candidateId: new Types.ObjectId(user.id), jobId: job._id, recruiterId: job.recruiterId, companyId: job.companyId,
        status: S.APPLIED,
        statusHistory: [{ status: S.APPLIED, changedBy: new Types.ObjectId(user.id), changedByName: user.name, role: Role.CANDIDATE, at: new Date() }],
        resumeDocumentId: resume._id, coverLetter: dto.coverLetter?.trim() || undefined,
        expectedSalary: dto.expectedSalary ? { amount: dto.expectedSalary.amount, currency: dto.expectedSalary.currency.toUpperCase() } : undefined,
        noticePeriodDays: dto.noticePeriodDays, relevantInfo: dto.relevantInfo?.trim() || undefined,
        documents: attached.map((d) => ({ label: d.label.trim(), documentId: new Types.ObjectId(d.documentId) })),
      } as never);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException({ message: 'You have already applied to this job', code: 'ALREADY_APPLIED' });
      throw e;
    }
    await this.events.publish(DomainEvent.APPLICATION_CREATED, {
      actor: { id: user.id, role: Role.CANDIDATE }, entity: { type: 'Application', id: app.id },
      newState: { status: S.APPLIED },
      data: { applicationNumber: app.applicationNumber, candidateName: user.name, candidateEmail: user.email, jobId: String(job._id), jobTitle: job.spec.title, jobNumber: job.jobNumber, recruiterId: String(job.recruiterId) },
    });
    return { id: app.id, applicationNumber: app.applicationNumber, status: app.status };
  }

  /* ---------------- Reads ---------------- */

  /** What each role is allowed to see at all. Recruiters only get candidates Admin has sent them. */
  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.CANDIDATE) return { candidateId: new Types.ObjectId(user.id) };
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id), status: { $in: RECRUITER_VISIBLE } };
    return {};
  }

  async list(q: ListApplicationsQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.scope(user);
    const statuses = q.statuses?.length ? q.statuses : q.status ? [q.status] : undefined;
    if (statuses) {
      // Recruiters cannot widen beyond the statuses they may see.
      filter.status = user.role === Role.RECRUITER ? { $in: statuses.filter((s) => RECRUITER_VISIBLE.includes(s)) } : { $in: statuses };
    }
    if (q.jobId) filter.jobId = new Types.ObjectId(q.jobId);
    if (q.candidateId && user.role !== Role.CANDIDATE) filter.candidateId = new Types.ObjectId(q.candidateId);

    let search = q.search;
    if (search?.trim() && user.role !== Role.CANDIDATE) {
      const rx = new RegExp(esc(search.trim()), 'i');
      const people = await this.users.find({ role: Role.CANDIDATE, $or: [{ name: rx }, { email: rx }] }).select('_id').limit(100).lean();
      filter.$or = [{ applicationNumber: rx }, { candidateId: { $in: people.map((p) => p._id) } }];
      search = undefined;
    }
    const { items, meta } = await paginate(this.apps, filter, { ...q, search }, {
      sortable: ['createdAt', 'updatedAt', 'applicationNumber', 'adminScore'], defaultSort: '-updatedAt',
      searchFields: user.role === Role.CANDIDATE ? ['applicationNumber'] : undefined,
      populate: user.role === Role.CANDIDATE ? ['jobId', 'companyId'] as never : ['jobId', 'companyId', 'candidateId'] as never,
      select: '-statusHistory -coverLetter -relevantInfo',
    });
    return { items: items.map((a) => this.presentListItem(a, user)), meta };
  }

  private jobBrief(j: any) {
    return j && typeof j === 'object' && j.spec ? { id: String(j._id), jobNumber: j.jobNumber, title: j.spec.title, location: j.spec.location, workMode: j.spec.workMode, employmentType: j.spec.employmentType, status: j.status } : { id: String(j) };
  }

  private presentListItem(a: any, user: AuthUser) {
    const staff = user.role !== Role.CANDIDATE;
    return {
      id: String(a._id), applicationNumber: a.applicationNumber, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt,
      job: this.jobBrief(a.jobId),
      company: a.companyId?.name ? { id: String(a.companyId._id), name: a.companyId.name } : { id: String(a.companyId) },
      expectedSalary: a.expectedSalary, noticePeriodDays: a.noticePeriodDays,
      ...(staff ? { candidate: a.candidateId?.name ? { id: String(a.candidateId._id), name: a.candidateId.name, email: a.candidateId.email } : { id: String(a.candidateId) }, adminScore: a.adminScore } : {}),
    };
  }

  private async load(id: string, user: AuthUser) {
    const app = await this.apps.findOne({ _id: id, ...this.scope(user) });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async get(id: string, user: AuthUser) {
    const app = await this.load(id, user);
    await app.populate(['jobId', 'companyId', 'candidateId']);
    const a: any = app.toObject();
    const staff = user.role !== Role.CANDIDATE;

    // Candidates see their own progress, never staff reasons, notes or scores.
    const history = a.statusHistory.map((h: any) => ({
      status: h.status, at: h.at, role: h.role, changedByName: staff || h.role === Role.CANDIDATE ? h.changedByName : undefined,
      ...(staff ? { reason: h.reason, notes: h.notes, override: h.override } : {}),
    }));
    const base = {
      id: String(a._id), applicationNumber: a.applicationNumber, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt,
      job: this.jobBrief(a.jobId), jobSpec: user.role === Role.CANDIDATE ? await this.publicSpec(a.jobId) : a.jobId?.spec,
      company: { id: String(a.companyId._id), name: a.companyId.name, location: a.companyId.location },
      coverLetter: a.coverLetter, expectedSalary: a.expectedSalary, noticePeriodDays: a.noticePeriodDays, relevantInfo: a.relevantInfo,
      statusHistory: history,
      documents: a.documents.map((d: any) => ({ label: d.label, documentId: String(d.documentId) })),
      resumeDocumentId: a.resumeDocumentId ? String(a.resumeDocumentId) : undefined,
      transitions: allowedTransitions(a.status, user.role),
    };
    if (!staff) return base;

    const profile = await this.profiles.findOne({ userId: a.candidateId._id }).lean();
    return {
      ...base,
      candidate: { id: String(a.candidateId._id), name: a.candidateId.name, email: a.candidateId.email, phone: a.candidateId.phone, country: a.candidateId.country },
      candidateProfile: profile && { headline: profile.headline, about: profile.about, location: profile.location, skills: profile.skills, experienceYears: profile.experienceYears, experience: profile.experience, education: profile.education, expectedSalary: profile.expectedSalary, noticePeriodDays: profile.noticePeriodDays },
      adminScore: a.adminScore, adminNotes: a.adminNotes, resumeScore: a.resumeScore, tags: a.tags ?? [], recruiterScore: a.recruiterScore, recruiterNotes: a.recruiterNotes, recruiterDecision: a.recruiterDecision,
    };
  }

  /** What a candidate may see of the opening: no internal notes, and the pay left after our commission. */
  private async publicSpec(job: any) {
    const spec = job?.spec;
    if (!spec) return spec;
    const { specialInstructions, ...details } = spec.details ?? {};
    return { ...spec, details, compensation: spec.compensation ? await this.pricing.candidateCompensation(job) : spec.compensation };
  }

  /* ---------------- Changes ---------------- */

  async transition(id: string, dto: TransitionDto, user: AuthUser) {
    await this.load(id, user); // enforces ownership/visibility before the workflow runs
    if (dto.override && user.role !== Role.ADMIN) throw new BadRequestException('Only Admin can override the workflow');
    const updated = await this.workflow.transition(id, dto.status, user, { reason: dto.reason, notes: dto.notes, override: dto.override });
    return { id, status: updated.status };
  }

  async withdraw(id: string, user: AuthUser, reason?: string) {
    await this.load(id, user);
    const updated = await this.workflow.transition(id, S.WITHDRAWN, user, { reason });
    return { id, status: updated.status };
  }

  async counts(user: AuthUser) {
    const rows = await this.apps.aggregate([{ $match: this.scope(user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }
}
