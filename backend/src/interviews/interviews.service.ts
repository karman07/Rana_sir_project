import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, DomainEvent, InterviewStatus as IS, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import type { AuthUser } from '../auth/decorators';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import { Email } from '../communication/schemas/email.schema';
import { MailService } from '../communication/mail.service';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import type { CreateInterviewDto, FeedbackDto, ListInterviewsQueryDto, UpdateInterviewDto } from './dto/interview.dto';
import { formatInterviewTime, isValidZone, overlaps } from './interview-time';
import { InterviewFeedback } from './schemas/interview-feedback.schema';
import { Interview, InterviewType, type InterviewDocument } from './schemas/interview.schema';

const HOUR = 3_600_000;
/** Round one is ours, while the candidate is being screened; round two is the hiring recruiter's, once they have approved the candidate. */
const ADMIN_ROUND: string[] = [S.APPLIED, S.ADMIN_REVIEW, S.ADMIN_INTERVIEW];
const RECRUITER_ROUND: string[] = [S.RECRUITER_APPROVED, S.INTERVIEW];

@Injectable()
export class InterviewsService {
  constructor(
    @InjectModel(Interview.name) private readonly interviews: Model<Interview>,
    @InjectModel(InterviewFeedback.name) private readonly feedback: Model<InterviewFeedback>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Email.name) private readonly emails: Model<Email>,
    private readonly workflow: RecruitmentWorkflowService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly mail: MailService,
  ) {}

  /* ---------------- helpers ---------------- */

  private async loadInterview(id: string, user: AuthUser): Promise<InterviewDocument> {
    const scope: Record<string, unknown> = { _id: id };
    // Our own round-one interviews are internal: the hiring recruiter never sees them.
    if (user.role === Role.RECRUITER) { scope.recruiterId = user.id; scope.stage = { $ne: 'ADMIN' }; }
    if (user.role === Role.CANDIDATE) scope.candidateId = user.id;
    const doc = await this.interviews.findOne(scope as never);
    if (!doc) throw new NotFoundException('Interview not found');
    return doc;
  }

  private assertStaff(user: AuthUser) {
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
  }

  private validateDetails(type: InterviewType, d: { meetingLink?: string; location?: string; timezone?: string }) {
    const problems: string[] = [];
    if (type === InterviewType.VIDEO && !d.meetingLink) problems.push('A meeting link is required for video interviews');
    if (type === InterviewType.IN_PERSON && !d.location) problems.push('A location is required for in-person interviews');
    if (d.timezone && !isValidZone(d.timezone)) problems.push('Unknown time zone');
    if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
  }

  private async assertNoConflict(candidateId: unknown, startsAt: Date, minutes: number, ignoreId?: string) {
    const nearby = await this.interviews.find({
      candidateId: candidateId as never, status: IS.SCHEDULED, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
      startsAt: { $gt: new Date(+startsAt - 8 * HOUR), $lt: new Date(+startsAt + 8 * HOUR) },
    }).lean();
    if (nearby.some((o) => overlaps(startsAt, minutes, o.startsAt, o.durationMinutes))) {
      throw new ConflictException({ message: 'The candidate already has an interview at that time', code: 'INTERVIEW_CONFLICT' });
    }
  }

  private async queueReminder(i: InterviewDocument, candidate: { email: string; name: string; id: string }, jobTitle: string, link: string) {
    const when = new Date(+i.startsAt - 24 * HOUR);
    if (when <= new Date()) return undefined;
    const { date, time } = formatInterviewTime(i.startsAt, i.timezone);
    return this.mail.send({
      to: candidate.email, toName: candidate.name, userId: candidate.id, template: 'interview-reminder', sendAt: when,
      vars: { jobTitle, interviewDate: date, interviewTime: time, link }, related: { type: 'Interview', id: i.id },
    });
  }

  private async dropReminder(i: InterviewDocument) {
    if (i.reminderEmailId) await this.emails.deleteOne({ _id: i.reminderEmailId, status: 'QUEUED' });
  }

  private eventData(i: InterviewDocument, jobTitle?: string, extra: Record<string, unknown> = {}) {
    const { date, time } = formatInterviewTime(i.startsAt, i.timezone);
    return {
      interviewNumber: i.interviewNumber, applicationId: String(i.applicationId), candidateId: String(i.candidateId), recruiterId: String(i.recruiterId),
      jobTitle, interviewDate: date, interviewTime: time, startsAt: i.startsAt.toISOString(), type: i.type, round: String(i.round), stage: i.stage ?? 'RECRUITER',
      meetingLink: i.meetingLink, location: i.location, ...extra,
    };
  }

  private async jobTitleFor(jobId: unknown) {
    return (await this.jobs.findById(jobId as never).select('spec.title').lean())?.spec?.title;
  }

  /* ---------------- commands ---------------- */

  async schedule(dto: CreateInterviewDto, user: AuthUser) {
    this.assertStaff(user);
    const app = await this.apps.findOne({ _id: dto.applicationId, ...(user.role === Role.RECRUITER ? { recruiterId: user.id as never } : {}) });
    if (!app) throw new NotFoundException('Application not found');
    const stage = ADMIN_ROUND.includes(app.status) ? 'ADMIN' as const : RECRUITER_ROUND.includes(app.status) ? 'RECRUITER' as const : undefined;
    if (!stage) {
      throw new ConflictException({ message: 'Interviews are arranged while a candidate is being screened by our team, and again once the recruiter has approved them', code: 'NOT_SCHEDULABLE' });
    }
    if (stage === 'ADMIN' && user.role !== Role.ADMIN) throw new ForbiddenException('Our team runs the first interview');
    const startsAt = new Date(dto.startsAt);
    if (startsAt.getTime() < Date.now() + 5 * 60_000) throw new BadRequestException({ message: 'Choose a time in the future', code: 'PAST_TIME' });
    this.validateDetails(dto.type, dto);
    await this.assertNoConflict(app.candidateId, startsAt, dto.durationMinutes);

    // Arranging round one from a brand-new application starts its review first, so the history reads honestly.
    if (app.status === S.APPLIED) await this.workflow.transition(String(app._id), S.ADMIN_REVIEW, user);
    if (app.status === S.APPLIED || app.status === S.ADMIN_REVIEW) await this.workflow.transition(String(app._id), S.ADMIN_INTERVIEW, user);
    if (app.status === S.RECRUITER_APPROVED) await this.workflow.transition(String(app._id), S.INTERVIEW, user);

    const round = (await this.interviews.countDocuments({ applicationId: app._id, stage, status: { $ne: IS.RESCHEDULED } })) + 1;
    const n = await this.counters.next('interview');
    const doc = await this.interviews.create({
      interviewNumber: `INT-${String(n).padStart(4, '0')}`, applicationId: app._id, jobId: app.jobId, candidateId: app.candidateId, recruiterId: app.recruiterId,
      scheduledBy: new Types.ObjectId(user.id), stage, type: dto.type, startsAt, durationMinutes: dto.durationMinutes, timezone: dto.timezone ?? 'UTC', round,
      meetingLink: dto.meetingLink, location: dto.location, phoneNumber: dto.phoneNumber, interviewers: dto.interviewers?.length ? dto.interviewers : stage === 'ADMIN' ? [{ name: user.name, email: user.email }] : [], instructions: dto.instructions, notes: dto.notes,
      history: [{ status: IS.SCHEDULED, at: new Date(), byName: user.name }],
    });

    const [candidate, jobTitle] = await Promise.all([this.users.findById(app.candidateId).lean(), this.jobTitleFor(app.jobId)]);
    if (candidate) {
      const id = await this.queueReminder(doc, { email: candidate.email, name: candidate.name, id: String(candidate._id) }, jobTitle ?? 'your interview', '/candidate/interviews');
      if (id) await this.interviews.updateOne({ _id: doc._id }, { reminderEmailId: id });
    }
    await this.events.publish(DomainEvent.INTERVIEW_SCHEDULED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id: doc.id }, newState: { status: IS.SCHEDULED, startsAt, type: dto.type, round, stage },
      data: this.eventData(doc, jobTitle),
    });
    return this.presentOne(doc.toObject(), user);
  }

  async update(id: string, dto: UpdateInterviewDto, user: AuthUser) {
    this.assertStaff(user);
    const old = await this.loadInterview(id, user);
    if (old.status !== IS.SCHEDULED) throw new ConflictException({ message: 'Only scheduled interviews can be changed', code: 'NOT_SCHEDULED' });

    const type = dto.type ?? old.type;
    const merged = {
      meetingLink: dto.meetingLink ?? old.meetingLink, location: dto.location ?? old.location, timezone: dto.timezone ?? old.timezone,
    };
    this.validateDetails(type, merged);
    const newStart = dto.startsAt ? new Date(dto.startsAt) : old.startsAt;
    const minutes = dto.durationMinutes ?? old.durationMinutes;
    const moved = Math.abs(+newStart - +old.startsAt) >= 60_000;
    const details = {
      type, durationMinutes: minutes, timezone: merged.timezone, meetingLink: merged.meetingLink, location: merged.location,
      phoneNumber: dto.phoneNumber ?? old.phoneNumber, interviewers: dto.interviewers ?? old.interviewers, instructions: dto.instructions ?? old.instructions, notes: dto.notes ?? old.notes,
    };
    const jobTitle = await this.jobTitleFor(old.jobId);

    if (!moved && minutes === old.durationMinutes) {
      await this.interviews.updateOne({ _id: id }, { $set: details });
      const updated = (await this.interviews.findById(id))!;
      await this.events.publish(DomainEvent.INTERVIEW_UPDATED, {
        actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id }, previousState: { meetingLink: old.meetingLink, location: old.location }, newState: { meetingLink: details.meetingLink, location: details.location },
        data: this.eventData(updated, jobTitle),
      });
      return this.presentOne(updated.toObject(), user);
    }

    if (newStart.getTime() < Date.now() + 5 * 60_000) throw new BadRequestException({ message: 'Choose a time in the future', code: 'PAST_TIME' });
    await this.assertNoConflict(old.candidateId, newStart, minutes, id);

    // Rescheduling keeps the old slot as history (status RESCHEDULED) and creates the new interview.
    const n = await this.counters.next('interview');
    const fresh = await this.interviews.create({
      interviewNumber: `INT-${String(n).padStart(4, '0')}`, applicationId: old.applicationId, jobId: old.jobId, candidateId: old.candidateId, recruiterId: old.recruiterId,
      scheduledBy: new Types.ObjectId(user.id), ...details, startsAt: newStart, round: old.round, stage: old.stage ?? 'RECRUITER', rescheduledFrom: old._id,
      history: [{ status: IS.SCHEDULED, at: new Date(), byName: user.name, reason: dto.reason ?? 'Rescheduled' }],
    });
    await this.dropReminder(old);
    await this.interviews.updateOne({ _id: old._id }, { status: IS.RESCHEDULED, rescheduledTo: fresh._id, $push: { history: { status: IS.RESCHEDULED, at: new Date(), byName: user.name, reason: dto.reason } } });

    const candidate = await this.users.findById(old.candidateId).lean();
    if (candidate) {
      const rid = await this.queueReminder(fresh, { email: candidate.email, name: candidate.name, id: String(candidate._id) }, jobTitle ?? 'your interview', '/candidate/interviews');
      if (rid) await this.interviews.updateOne({ _id: fresh._id }, { reminderEmailId: rid });
    }
    const before = formatInterviewTime(old.startsAt, old.timezone);
    await this.events.publish(DomainEvent.INTERVIEW_RESCHEDULED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id: fresh.id }, reason: dto.reason,
      previousState: { interviewId: id, startsAt: old.startsAt, status: IS.SCHEDULED }, newState: { startsAt: newStart, status: IS.SCHEDULED },
      data: this.eventData(fresh, jobTitle, { previousDate: before.date, previousTime: before.time }),
    });
    return this.presentOne(fresh.toObject(), user);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    this.assertStaff(user);
    const i = await this.loadInterview(id, user);
    if (i.status !== IS.SCHEDULED) throw new ConflictException({ message: 'Only scheduled interviews can be cancelled', code: 'NOT_SCHEDULED' });
    await this.dropReminder(i);
    await this.interviews.updateOne({ _id: id }, { status: IS.CANCELLED, cancelReason: reason, $push: { history: { status: IS.CANCELLED, at: new Date(), byName: user.name, reason } } });
    await this.events.publish(DomainEvent.INTERVIEW_CANCELLED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id }, reason, previousState: { status: IS.SCHEDULED }, newState: { status: IS.CANCELLED },
      data: this.eventData(i, await this.jobTitleFor(i.jobId)),
    });
    return { id, status: IS.CANCELLED };
  }

  private async finish(id: string, to: typeof IS.COMPLETED | typeof IS.NO_SHOW, user: AuthUser, event: DomainEvent) {
    this.assertStaff(user);
    const i = await this.loadInterview(id, user);
    if (i.status !== IS.SCHEDULED) throw new ConflictException({ message: 'Only scheduled interviews can be closed out', code: 'NOT_SCHEDULED' });
    if (+i.startsAt > Date.now()) throw new ConflictException({ message: 'This interview has not started yet', code: 'NOT_STARTED' });
    await this.interviews.updateOne({ _id: id }, { status: to, $push: { history: { status: to, at: new Date(), byName: user.name } } });
    await this.events.publish(event, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id }, previousState: { status: IS.SCHEDULED }, newState: { status: to },
      data: this.eventData(i, await this.jobTitleFor(i.jobId)),
    });
    return { id, status: to };
  }

  complete(id: string, user: AuthUser) { return this.finish(id, IS.COMPLETED, user, DomainEvent.INTERVIEW_COMPLETED); }
  noShow(id: string, user: AuthUser) { return this.finish(id, IS.NO_SHOW, user, DomainEvent.INTERVIEW_NO_SHOW); }

  async submitFeedback(id: string, dto: FeedbackDto, user: AuthUser) {
    this.assertStaff(user);
    const i = await this.loadInterview(id, user);
    if (i.status === IS.CANCELLED || i.status === IS.RESCHEDULED) throw new ConflictException({ message: 'This interview did not take place', code: 'NOT_HELD' });
    if (+i.startsAt > Date.now()) throw new ConflictException({ message: 'Feedback can be added once the interview has started', code: 'NOT_STARTED' });

    const fb = await this.feedback.findOneAndUpdate(
      { interviewId: i._id, authorId: new Types.ObjectId(user.id) },
      { $set: { ...dto, applicationId: i.applicationId, authorName: user.name, authorRole: user.role } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    if (i.status === IS.SCHEDULED) {
      await this.interviews.updateOne({ _id: id }, { status: IS.COMPLETED, $push: { history: { status: IS.COMPLETED, at: new Date(), byName: user.name, reason: 'Feedback submitted' } } });
    }
    await this.events.publish(DomainEvent.INTERVIEW_FEEDBACK_SUBMITTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Interview', id }, newState: { recommendation: dto.recommendation, overallRating: dto.overallRating },
      data: this.eventData(i, await this.jobTitleFor(i.jobId), { recommendation: dto.recommendation, authorName: user.name }),
    });
    const { _id, __v, ...rest } = fb!.toObject() as any;
    return { id: String(_id), ...rest };
  }

  /* ---------------- reads ---------------- */

  private async presentOne(i: any, user: AuthUser) {
    const [job, candidate, recruiter] = await Promise.all([
      this.jobs.findById(i.jobId).populate('companyId', 'name').lean() as any,
      this.users.findById(i.candidateId).select('name email phone').lean(),
      this.users.findById(i.recruiterId).select('name').lean(),
    ]);
    return this.view(i, user, { job, candidate, recruiter });
  }

  private view(i: any, user: AuthUser, ctx: { job?: any; candidate?: any; recruiter?: any } = {}) {
    const { _id, __v, deletedAt, scheduledBy, reminderEmailId, jobId, candidateId, recruiterId, applicationId, ...rest } = i;
    const staff = user.role !== Role.CANDIDATE;
    const out: Record<string, unknown> = {
      id: String(_id), ...rest, applicationId: String(applicationId?._id ?? applicationId),
      job: ctx.job ? { id: String(ctx.job._id), jobNumber: ctx.job.jobNumber, title: ctx.job.spec?.title, company: ctx.job.companyId?.name, location: ctx.job.spec?.location } : { id: String(jobId?._id ?? jobId), title: jobId?.spec?.title, company: jobId?.companyId?.name },
      candidate: ctx.candidate ? { id: String(ctx.candidate._id), name: ctx.candidate.name, email: ctx.candidate.email } : candidateId?.name ? { id: String(candidateId._id), name: candidateId.name, email: candidateId.email } : { id: String(candidateId) },
      recruiter: ctx.recruiter ? { id: String(ctx.recruiter._id), name: ctx.recruiter.name } : recruiterId?.name ? { id: String(recruiterId._id), name: recruiterId.name } : undefined,
    };
    if (!staff) { delete out.notes; delete out.history; delete out.cancelReason; delete out.rescheduledFrom; delete out.rescheduledTo; }
    return out;
  }

  async list(q: ListInterviewsQueryDto, user: AuthUser) {
    const filter: Record<string, any> = {};
    if (user.role === Role.RECRUITER) { filter.recruiterId = new Types.ObjectId(user.id); filter.stage = { $ne: 'ADMIN' }; }
    if (user.role === Role.CANDIDATE) filter.candidateId = new Types.ObjectId(user.id);
    if (q.stage) filter.stage = q.stage;
    if (q.status) filter.status = q.status;
    if (q.applicationId) filter.applicationId = new Types.ObjectId(q.applicationId);
    if (q.upcoming) { filter.status = IS.SCHEDULED; filter.startsAt = { ...(filter.startsAt ?? {}), $gte: new Date() }; }
    if (q.from || q.to) filter.startsAt = { ...(filter.startsAt ?? {}), ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
    const { items, meta } = await paginate(this.interviews, filter, q, {
      sortable: ['startsAt', 'createdAt'], defaultSort: 'startsAt', searchFields: ['interviewNumber'],
      populate: ['candidateId', 'recruiterId', { path: 'jobId', populate: { path: 'companyId', select: 'name' } }] as never,
    });
    return { items: items.map((i: any) => this.view(i, user)), meta };
  }

  async get(id: string, user: AuthUser) {
    const doc = await this.loadInterview(id, user);
    const view = (await this.presentOne(doc.toObject(), user)) as Record<string, unknown>;
    if (user.role === Role.CANDIDATE) return view;
    const rows = await this.feedback.find({ interviewId: doc._id }).sort({ createdAt: 1 }).lean();
    return { ...view, feedback: rows.map(({ _id, __v, ...f }: any) => ({ id: String(_id), ...f })) };
  }

  /** Counts for dashboards: upcoming, this week, and interviews that finished without feedback. */
  async summary(user: AuthUser) {
    const scope: Record<string, unknown> = user.role === Role.RECRUITER ? { recruiterId: new Types.ObjectId(user.id), stage: { $ne: 'ADMIN' } } : user.role === Role.CANDIDATE ? { candidateId: new Types.ObjectId(user.id) } : {};
    const now = new Date();
    const weekEnd = new Date(+now + 7 * 24 * HOUR);
    const [upcoming, thisWeek, held] = await Promise.all([
      this.interviews.countDocuments({ ...scope, status: IS.SCHEDULED, startsAt: { $gte: now } } as never),
      this.interviews.countDocuments({ ...scope, status: IS.SCHEDULED, startsAt: { $gte: now, $lte: weekEnd } } as never),
      this.interviews.find({ ...scope, status: { $in: [IS.SCHEDULED, IS.COMPLETED] }, startsAt: { $lt: now } } as never).select('_id').lean(),
    ]);
    const withFeedback = held.length ? await this.feedback.distinct('interviewId', { interviewId: { $in: held.map((h) => h._id) } }) : [];
    return { upcoming, thisWeek, awaitingFeedback: held.length - withFeedback.length };
  }
}
