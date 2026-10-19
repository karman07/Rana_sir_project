import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, DomainEvent, JobStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import { Job } from '../jobs/schemas/job.schema';
import type { RecruiterApproveDto, RequestMoreCandidatesDto } from './dto/screening.dto';
import { CandidateRequest } from './schemas/candidate-request.schema';

/** What a recruiter can do with a candidate Admin has sent them. Every "no" returns to Admin (spec §26). */
@Injectable()
export class RecruiterReviewService {
  constructor(
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(CandidateRequest.name) private readonly requests: Model<CandidateRequest>,
    private readonly workflow: RecruitmentWorkflowService,
    private readonly events: EventBusService,
  ) {}

  /** The recruiter must own the application's job and the candidate must have been sent to them. */
  private async mine(id: string, user: AuthUser) {
    const app = await this.apps.findOne({ _id: id, recruiterId: user.id as never, status: { $in: [S.SENT_TO_RECRUITER, S.RECRUITER_REVIEW] } as never });
    if (!app) throw new NotFoundException('Candidate not found');
    return app;
  }

  /** Opening a candidate for the first time marks them as under review. */
  private async ensureReview(app: { id: string; status: S }, user: AuthUser) {
    if (app.status === S.SENT_TO_RECRUITER) await this.workflow.transition(app.id, S.RECRUITER_REVIEW, user);
  }

  async approve(id: string, dto: RecruiterApproveDto, user: AuthUser) {
    const app = await this.mine(id, user);
    await this.ensureReview(app, user);
    const set: Record<string, unknown> = {};
    if (dto.score !== undefined) set.recruiterScore = dto.score;
    if (dto.notes?.trim()) set.recruiterNotes = dto.notes.trim();
    if (Object.keys(set).length) await this.apps.updateOne({ _id: id }, { $set: set });
    const updated = await this.workflow.transition(id, S.RECRUITER_APPROVED, user, { notes: dto.notes });
    return { id, status: updated.status };
  }

  private async sendBack(id: string, reason: string, type: 'REJECTED' | 'CHANGES_REQUESTED', user: AuthUser) {
    const app = await this.mine(id, user);
    await this.ensureReview(app, user);
    await this.apps.updateOne({ _id: id }, { $set: { recruiterDecision: { type, reason: reason.trim(), at: new Date(), byName: user.name, pending: true } } });
    const updated = await this.workflow.transition(id, S.ADMIN_REVIEW, user, {
      reason, event: type === 'REJECTED' ? DomainEvent.RECRUITER_REJECTED : DomainEvent.RECRUITER_REQUESTED_CHANGES,
    });
    return { id, status: updated.status };
  }

  /** The recruiter's "no" is final and immediate: the candidate is rejected, Admin is told, and nothing waits for approval. */
  async reject(id: string, reason: string, user: AuthUser) {
    const app = await this.apps.findOne({ _id: id, recruiterId: user.id as never, status: { $in: [S.SENT_TO_RECRUITER, S.RECRUITER_REVIEW, S.RECRUITER_APPROVED, S.INTERVIEW] } as never });
    if (!app) throw new NotFoundException('Candidate not found');
    await this.apps.updateOne({ _id: id }, { $set: { recruiterDecision: { type: 'REJECTED', reason: reason.trim(), at: new Date(), byName: user.name, pending: false } } });
    const updated = await this.workflow.transition(id, S.REJECTED, user, { reason });
    await this.events.publish(DomainEvent.RECRUITER_REJECTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Application', id }, reason, newState: { status: S.REJECTED },
    });
    return { id, status: updated.status };
  }
  requestChanges(id: string, reason: string, user: AuthUser) { return this.sendBack(id, reason, 'CHANGES_REQUESTED', user); }

  /* ---------------- Request more candidates ---------------- */

  async requestMore(jobId: string, dto: RequestMoreCandidatesDto, user: AuthUser) {
    const job = await this.jobs.findOne({ _id: jobId, recruiterId: user.id as never });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.PUBLISHED) throw new ConflictException({ message: 'Candidates can only be requested for live jobs', code: 'JOB_NOT_LIVE' });
    if (await this.requests.exists({ jobId: job._id, recruiterId: user.id as never, status: 'PENDING' })) {
      throw new ConflictException({ message: 'You already have an open request for this job', code: 'REQUEST_EXISTS' });
    }
    const r = await this.requests.create({ jobId: job._id, recruiterId: new Types.ObjectId(user.id), ...dto });
    await this.events.publish(DomainEvent.CANDIDATES_REQUESTED, {
      actor: { id: user.id, role: Role.RECRUITER }, entity: { type: 'CandidateRequest', id: r.id },
      reason: dto.reason, newState: { count: dto.count, status: 'PENDING' },
      data: { jobId: String(job._id), jobTitle: job.spec.title, jobNumber: job.jobNumber, recruiterName: user.name, count: String(dto.count), updatedRequirements: dto.updatedRequirements, comments: dto.comments },
    });
    return { id: r.id, status: r.status };
  }

  /** Admin closes a request: HANDLED (candidates are on their way) or DECLINED. */
  async decide(id: string, admin: AuthUser, handled: boolean, note?: string) {
    const r = await this.requests.findOneAndUpdate(
      { _id: id, status: 'PENDING' },
      { status: handled ? 'HANDLED' : 'DECLINED', decidedBy: new Types.ObjectId(admin.id), decidedAt: new Date(), decisionNote: note },
      { returnDocument: 'after' },
    );
    if (!r) throw new ConflictException({ message: 'This request is no longer pending', code: 'NOT_PENDING' });
    const job = await this.jobs.findById(r.jobId).select('spec.title').lean();
    await this.events.publish(DomainEvent.CANDIDATES_REQUEST_DECIDED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'CandidateRequest', id }, reason: note,
      previousState: { status: 'PENDING' }, newState: { status: r.status },
      data: { recruiterId: String(r.recruiterId), jobTitle: job?.spec?.title, decision: handled ? 'handled' : 'declined' },
    });
    return { id, status: r.status };
  }

  mineRequests(user: AuthUser) {
    return this.requests.find({ recruiterId: user.id as never }).sort({ createdAt: -1 }).limit(50).lean().then((rows) => rows.map(({ _id, __v, ...r }: any) => ({ id: String(_id), ...r })));
  }

  assertRecruiter(user: AuthUser) {
    if (user.role !== Role.RECRUITER) throw new ForbiddenException();
  }
}
