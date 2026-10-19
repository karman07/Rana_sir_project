import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, DomainEvent, JobStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import type { AuthUser } from '../auth/decorators';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { EventBusService } from '../common/events/event-bus.service';
import { Interview } from '../interviews/schemas/interview.schema';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import type { ScreenDto } from './dto/screening.dto';
import { computeMatch, type MatchResult } from './match';

/** Stages Admin works in. */
export const SCREENING_STAGES = [S.APPLIED, S.ADMIN_REVIEW, S.ADMIN_INTERVIEW, S.ADMIN_SHORTLISTED];

@Injectable()
export class ScreeningService {
  constructor(
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(Interview.name) private readonly interviews: Model<Interview>,
    private readonly workflow: RecruitmentWorkflowService,
    private readonly events: EventBusService,
  ) {}

  private matchFor(profile: any, job: any, app: any): MatchResult {
    const spec = job?.spec ?? {};
    return computeMatch({
      candidate: { skills: profile?.skills, experienceYears: profile?.experienceYears, expectedSalary: app.expectedSalary ?? profile?.expectedSalary },
      job: { technicalSkills: spec.requirements?.technicalSkills, experienceMin: spec.requirements?.experienceMin, experienceMax: spec.requirements?.experienceMax, salaryMax: spec.compensation?.salaryMax, currency: spec.compensation?.currency },
    });
  }

  /** Jobs with applicants waiting for Admin, plus per-stage counts: the screening queue overview. */
  async queue() {
    const rows = await this.apps.aggregate([
      { $match: { status: { $in: SCREENING_STAGES } } },
      { $group: { _id: { job: '$jobId', status: '$status' }, n: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
    ]);
    const byJob = new Map<string, { applied: number; inReview: number; interviewing: number; shortlisted: number; oldest?: Date }>();
    for (const r of rows) {
      const k = String(r._id.job);
      const e = byJob.get(k) ?? { applied: 0, inReview: 0, interviewing: 0, shortlisted: 0 };
      if (r._id.status === S.APPLIED) e.applied = r.n; else if (r._id.status === S.ADMIN_REVIEW) e.inReview = r.n; else if (r._id.status === S.ADMIN_INTERVIEW) e.interviewing = r.n; else e.shortlisted = r.n;
      e.oldest = !e.oldest || r.oldest < e.oldest ? r.oldest : e.oldest;
      byJob.set(k, e);
    }
    const jobs = await this.jobs.find({ _id: { $in: [...byJob.keys()] } }).populate('companyId', 'name').lean();
    return jobs.map((j: any) => ({
      id: String(j._id), jobNumber: j.jobNumber, title: j.spec.title, status: j.status, company: j.companyId?.name, location: j.spec.location,
      ...byJob.get(String(j._id))!, waiting: byJob.get(String(j._id))!.applied + byJob.get(String(j._id))!.inReview + byJob.get(String(j._id))!.interviewing,
    })).sort((a, b) => b.waiting - a.waiting || +new Date(a.oldest!) - +new Date(b.oldest!));
  }

  /** Candidate ranking for one job (spec §22). */
  async ranking(jobId: string, opts: { status?: S[] } = {}) {
    const job: any = await this.jobs.findById(jobId).populate('companyId', 'name').lean();
    if (!job) throw new NotFoundException('Job not found');
    const filter: Record<string, unknown> = { jobId: new Types.ObjectId(jobId) };
    if (opts.status?.length) filter.status = { $in: opts.status };
    const apps = await this.apps.find(filter).populate('candidateId', 'name email').lean();
    const profiles = await this.profiles.find({ userId: { $in: apps.map((a: any) => a.candidateId?._id) } }).lean();
    const byUser = new Map(profiles.map((p) => [String(p.userId), p]));

    const rows = apps.map((a: any) => {
      const p = byUser.get(String(a.candidateId?._id));
      const match = this.matchFor(p, job, a);
      return {
        id: String(a._id), applicationNumber: a.applicationNumber, status: a.status, createdAt: a.createdAt,
        candidate: { id: String(a.candidateId?._id), name: a.candidateId?.name, email: a.candidateId?.email, headline: p?.headline, location: p?.location },
        experienceYears: p?.experienceYears ?? null, skills: p?.skills ?? [], match,
        resumeScore: a.resumeScore ?? null, adminScore: a.adminScore ?? null, tags: a.tags ?? [], hasNotes: !!a.adminNotes,
        expectedSalary: a.expectedSalary ?? p?.expectedSalary ?? null, noticePeriodDays: a.noticePeriodDays ?? p?.noticePeriodDays ?? null,
        recruiterDecision: a.recruiterDecision?.pending ? a.recruiterDecision : undefined,
      };
    });
    // Admin's own score decides; the automatic match breaks ties and orders unscored candidates.
    rows.sort((a, b) => (b.adminScore ?? -1) - (a.adminScore ?? -1) || b.match.overall - a.match.overall || +new Date(a.createdAt) - +new Date(b.createdAt));
    return {
      job: { id: String(job._id), jobNumber: job.jobNumber, title: job.spec.title, company: job.companyId?.name, openings: job.spec.openings, status: job.status, skills: job.spec.requirements?.technicalSkills ?? [] },
      rows,
    };
  }

  /** Match breakdown for one application (used by the screening panel). */
  async matchFor1(appId: string) {
    const app: any = await this.apps.findById(appId).lean();
    if (!app) throw new NotFoundException('Application not found');
    const [job, profile] = await Promise.all([this.jobs.findById(app.jobId).lean(), this.profiles.findOne({ userId: app.candidateId }).lean()]);
    return this.matchFor(profile, job, app);
  }

  async screen(appId: string, dto: ScreenDto, admin: AuthUser) {
    const app = await this.apps.findById(appId);
    if (!app) throw new NotFoundException('Application not found');
    if (([S.REJECTED, S.WITHDRAWN, S.PLACED] as string[]).includes(app.status)) throw new ConflictException({ message: 'This application is closed', code: 'TERMINAL_STATE' });

    // Starting to screen an untouched application moves it into review.
    if (app.status === S.APPLIED) await this.workflow.transition(appId, S.ADMIN_REVIEW, admin);

    const before = { adminScore: app.adminScore, resumeScore: app.resumeScore, tags: app.tags, adminNotes: app.adminNotes };
    const set: Record<string, unknown> = {};
    if (dto.adminScore !== undefined) set.adminScore = dto.adminScore;
    if (dto.resumeScore !== undefined) set.resumeScore = dto.resumeScore;
    if (dto.notes !== undefined) set.adminNotes = dto.notes.trim();
    if (dto.tags !== undefined) set.tags = [...new Set(dto.tags.map((t) => t.trim()).filter(Boolean))];
    if (Object.keys(set).length) await this.apps.updateOne({ _id: appId }, { $set: set });

    await this.events.publish(DomainEvent.APPLICATION_SCREENED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Application', id: appId },
      previousState: before, newState: set, data: { applicationNumber: app.applicationNumber },
    });
    return { id: appId, ...set };
  }

  /** Shortlist; an application still at APPLIED passes through review first so the history stays honest. */
  async shortlist(appId: string, admin: AuthUser, notes?: string) {
    const app = await this.apps.findById(appId).lean();
    if (!app) throw new NotFoundException('Application not found');
    // Checked up front so a refusal leaves the application exactly where it was.
    const closed = ([S.REJECTED, S.WITHDRAWN, S.PLACED] as string[]).includes(app.status);
    if (!closed && !(await this.interviews.exists({ applicationId: appId, stage: 'ADMIN', status: 'COMPLETED' } as never))) {
      throw new ConflictException({ message: 'Interview the candidate first. They can be shortlisted once the interview has been held', code: 'INTERVIEW_REQUIRED' });
    }
    if (app.status === S.APPLIED) await this.workflow.transition(appId, S.ADMIN_REVIEW, admin);
    // Back in screening with our interview already held (e.g. a recruiter sent them back): record the interview stage honestly, then shortlist.
    if ((await this.apps.findById(appId).select('status').lean())?.status === S.ADMIN_REVIEW) await this.workflow.transition(appId, S.ADMIN_INTERVIEW, admin);
    const updated = await this.workflow.transition(appId, S.ADMIN_SHORTLISTED, admin, { notes });
    return { id: appId, status: updated.status };
  }

  async reject(appId: string, admin: AuthUser, reason: string) {
    const updated = await this.workflow.transition(appId, S.REJECTED, admin, { reason });
    return { id: appId, status: updated.status };
  }

  /** Sends shortlisted candidates to their recruiters. Per-item results so one problem never blocks the rest. */
  async sendToRecruiter(ids: string[], admin: AuthUser, notes?: string) {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        const app = await this.apps.findById(id).lean();
        if (!app) throw new NotFoundException('Application not found');
        const job = await this.jobs.findById(app.jobId).select('status').lean();
        if (job?.status !== JobStatus.PUBLISHED) throw new BadRequestException('The job is no longer open');
        await this.workflow.transition(id, S.SENT_TO_RECRUITER, admin, { notes });
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.response?.message ?? e?.message ?? 'Could not send' });
      }
    }
    return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  /** Side-by-side comparison of 2-4 candidates (spec §23). */
  async compare(ids: string[]) {
    if (ids.length < 2 || ids.length > 4) throw new BadRequestException('Choose between 2 and 4 candidates to compare');
    const apps: any[] = await this.apps.find({ _id: { $in: ids } }).populate('candidateId', 'name email phone country').populate('jobId').lean();
    if (apps.length !== ids.length) throw new NotFoundException('One of the applications was not found');
    const profiles = await this.profiles.find({ userId: { $in: apps.map((a) => a.candidateId._id) } }).lean();
    const byUser = new Map(profiles.map((p) => [String(p.userId), p]));
    return {
      columns: ids.map((id) => {
        const a = apps.find((x) => String(x._id) === id)!;
        const p = byUser.get(String(a.candidateId._id));
        return {
          id, applicationNumber: a.applicationNumber, status: a.status, job: { id: String(a.jobId._id), title: a.jobId.spec.title, jobNumber: a.jobId.jobNumber },
          candidate: { id: String(a.candidateId._id), name: a.candidateId.name, email: a.candidateId.email, headline: p?.headline, location: p?.location },
          experienceYears: p?.experienceYears ?? null, skills: p?.skills ?? [], education: (p?.education ?? []).map((e) => `${e.degree}${e.field ? `, ${e.field}` : ''} — ${e.institution}`),
          expectedSalary: a.expectedSalary ?? p?.expectedSalary ?? null, noticePeriodDays: a.noticePeriodDays ?? p?.noticePeriodDays ?? null,
          adminScore: a.adminScore ?? null, resumeScore: a.resumeScore ?? null, tags: a.tags ?? [], match: this.matchFor(p, a.jobId, a),
        };
      }),
    };
  }
}
