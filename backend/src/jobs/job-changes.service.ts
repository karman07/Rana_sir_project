import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, JobStatus, Role } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import { Application } from '../applications/schemas/application.schema';
import type { CreateJobChangeDto, ListJobChangesQueryDto } from './dto/job-change.dto';
import { mergeSpec } from './job-requests.service';
import { diffSpec } from './job-spec-diff';
import { validateForSubmission } from './job-spec.validation';
import { JobsService } from './jobs.service';
import { JobChangeRequest, type JobChangeRequestDocument } from './schemas/job-change-request.schema';
import { JobRequest } from './schemas/job-request.schema';
import { Job } from './schemas/job.schema';

const plain = (x: any) => (x?.toObject ? x.toObject() : x);

@Injectable()
export class JobChangesService {
  constructor(
    @InjectModel(JobChangeRequest.name) private readonly changes: Model<JobChangeRequest>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(JobRequest.name) private readonly requests: Model<JobRequest>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    private readonly jobsService: JobsService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
  ) {}

  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id) };
    if (user.role === Role.ADMIN) return {};
    throw new ForbiddenException();
  }

  private async eventData(c: JobChangeRequestDocument | JobChangeRequest, job?: Job | null) {
    const j = job ?? (await this.jobs.findById(c.jobId).lean());
    return {
      changeId: String((c as any)._id), changeNumber: c.changeNumber, type: c.type, jobId: String(c.jobId), jobRequestId: String(c.jobRequestId), recruiterId: String(c.recruiterId),
      jobNumber: j?.jobNumber, jobTitle: j?.spec?.title, changedFields: c.changes.map((x) => x.label).join(', '),
    };
  }

  /** The recruiter asks to edit or close one of their live openings. */
  async create(jobId: string, dto: CreateJobChangeDto, user: AuthUser) {
    if (user.role !== Role.RECRUITER) throw new ForbiddenException('Only the recruiter who posted an opening can ask to change it');
    const job = await this.jobs.findOne({ _id: jobId, recruiterId: new Types.ObjectId(user.id) });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.PUBLISHED) throw new ConflictException({ message: 'Only live openings can be changed this way', code: 'NOT_LIVE' });
    if (await this.changes.exists({ jobId: job._id, status: 'PENDING' })) throw new ConflictException({ message: 'There is already a request for this opening waiting for our team', code: 'CHANGE_PENDING' });

    let spec: unknown, diff: ReturnType<typeof diffSpec> = [];
    if (dto.type === 'EDIT') {
      if (!dto.spec) throw new BadRequestException({ message: 'Send the updated opening', code: 'VALIDATION_FAILED' });
      spec = mergeSpec(plain(job.spec), dto.spec);
      const problems = validateForSubmission(spec as never);
      if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
      diff = diffSpec(plain(job.spec), spec);
      if (!diff.length) throw new BadRequestException({ message: 'Nothing has changed from the live opening', code: 'NO_CHANGES' });
    }
    const n = await this.counters.next('job-change');
    let doc: JobChangeRequestDocument;
    try {
      doc = await this.changes.create({
        changeNumber: `JCR-${String(n).padStart(4, '0')}`, jobId: job._id, jobRequestId: job.jobRequestId, recruiterId: job.recruiterId, companyId: job.companyId,
        type: dto.type, reason: dto.reason.trim(), spec: spec as never, changes: diff,
      });
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException({ message: 'There is already a request for this opening waiting for our team', code: 'CHANGE_PENDING' });
      throw e;
    }
    await this.events.publish(DomainEvent.JOB_CHANGE_REQUESTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'JobChangeRequest', id: doc.id }, reason: dto.reason,
      newState: { type: dto.type, status: 'PENDING', fields: diff.map((d) => d.label) }, data: await this.eventData(doc, job),
    });
    return this.view(doc.toObject(), user, job.toObject());
  }

  async cancel(id: string, user: AuthUser) {
    const c = await this.changes.findOne({ _id: id, ...this.scope(user) } as never);
    if (!c) throw new NotFoundException('Request not found');
    const res = await this.changes.findOneAndUpdate({ _id: id, status: 'PENDING' }, { status: 'CANCELLED', decidedAt: new Date(), decidedByName: user.name }, { returnDocument: 'after' });
    if (!res) throw new ConflictException({ message: 'This request has already been decided', code: 'NOT_PENDING' });
    await this.events.publish(DomainEvent.JOB_CHANGE_CANCELLED, { actor: { id: user.id, role: user.role }, entity: { type: 'JobChangeRequest', id }, data: await this.eventData(res) });
    return this.get(id, user);
  }

  /** Approving an edit updates the live opening (and the recruiter's own copy); approving a closure ends the opening. */
  async approve(id: string, admin: AuthUser, note?: string) {
    const claimed = await this.changes.findOneAndUpdate(
      { _id: id, status: 'PENDING' }, { status: 'APPROVED', decidedBy: new Types.ObjectId(admin.id), decidedByName: admin.name, decidedAt: new Date(), decisionNote: note },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      if (!(await this.changes.exists({ _id: id }))) throw new NotFoundException('Request not found');
      throw new ConflictException({ message: 'This request has already been decided', code: 'NOT_PENDING' });
    }
    try {
      const job = await this.jobs.findById(claimed.jobId);
      if (!job) throw new NotFoundException('Job not found');
      if (claimed.type === 'EDIT') {
        const before = plain(job.spec);
        job.spec = plain(claimed.spec) as never;
        await job.save();
        // The recruiter's own request page shows the opening as it now stands, with a record of how it got there.
        const jr = await this.requests.findById(claimed.jobRequestId);
        if (jr) {
          jr.version += 1;
          jr.spec = plain(claimed.spec) as never;
          jr.revisions.push({ version: jr.version, submittedAt: claimed.submittedAt, spec: plain(claimed.spec) } as never);
          jr.reviews.push({ action: 'CHANGE_APPROVED', byId: new Types.ObjectId(admin.id), byName: admin.name, byRole: admin.role, note: `${claimed.changeNumber}: ${claimed.reason}`, version: jr.version, at: new Date() } as never);
          await jr.save();
        }
        await this.events.publish(DomainEvent.JOB_UPDATED, {
          actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Job', id: String(job._id) }, reason: claimed.reason, previousState: { spec: before }, newState: { fields: claimed.changes.map((c) => c.label) },
          data: { jobNumber: job.jobNumber, title: job.spec?.title },
        });
      } else if (job.status !== JobStatus.CLOSED) {
        await this.jobsService.close(String(job._id), admin, claimed.reason);
      }
    } catch (e) {
      // Put it back so Admin can try again rather than leaving a request approved but not applied.
      await this.changes.updateOne({ _id: id }, { status: 'PENDING', $unset: { decidedBy: 1, decidedByName: 1, decidedAt: 1, decisionNote: 1 } });
      throw e;
    }
    await this.events.publish(DomainEvent.JOB_CHANGE_DECIDED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobChangeRequest', id }, reason: note, newState: { status: 'APPROVED' }, data: { ...(await this.eventData(claimed)), decision: 'approved' },
    });
    return this.get(id, admin);
  }

  async reject(id: string, admin: AuthUser, note: string) {
    const res = await this.changes.findOneAndUpdate(
      { _id: id, status: 'PENDING' }, { status: 'REJECTED', decidedBy: new Types.ObjectId(admin.id), decidedByName: admin.name, decidedAt: new Date(), decisionNote: note }, { returnDocument: 'after' },
    );
    if (!res) {
      if (!(await this.changes.exists({ _id: id }))) throw new NotFoundException('Request not found');
      throw new ConflictException({ message: 'This request has already been decided', code: 'NOT_PENDING' });
    }
    await this.events.publish(DomainEvent.JOB_CHANGE_DECIDED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobChangeRequest', id }, reason: note, newState: { status: 'REJECTED' }, data: { ...(await this.eventData(res)), decision: 'declined' },
    });
    return this.get(id, admin);
  }

  private async view(c: any, user: AuthUser, job?: any) {
    const j = job ?? (await this.jobs.findById(c.jobId).populate('companyId', 'name').lean());
    const [recruiter, applicants] = user.role === Role.ADMIN
      ? await Promise.all([this.requests.db.model('User').findById(c.recruiterId).select('name').lean(), c.type === 'CLOSE' ? this.apps.countDocuments({ jobId: c.jobId, status: { $nin: ['REJECTED', 'WITHDRAWN', 'PLACED'] } } as never) : 0])
      : [null, 0];
    return {
      id: String(c._id), changeNumber: c.changeNumber, type: c.type, status: c.status, reason: c.reason, changes: c.changes, submittedAt: c.submittedAt,
      decidedByName: c.decidedByName, decidedAt: c.decidedAt, decisionNote: c.decisionNote,
      job: { id: String(c.jobId), jobRequestId: String(c.jobRequestId), jobNumber: j?.jobNumber, title: j?.spec?.title, status: j?.status, company: j?.companyId?.name },
      recruiter: recruiter ? { id: String(c.recruiterId), name: (recruiter as any).name } : undefined,
      liveApplications: c.type === 'CLOSE' && user.role === Role.ADMIN ? applicants : undefined,
      actions: c.status === 'PENDING' ? (user.role === Role.ADMIN ? ['approve', 'reject'] : ['cancel']) : [],
    };
  }

  async list(q: ListJobChangesQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.scope(user);
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    if (q.jobId) filter.jobId = new Types.ObjectId(q.jobId);
    const { items, meta } = await paginate(this.changes, filter, q, { sortable: ['submittedAt', 'status', 'changeNumber'], defaultSort: '-submittedAt', searchFields: ['changeNumber', 'reason'] });
    return { items: await Promise.all(items.map((c: any) => this.view(c, user))), meta };
  }

  async get(id: string, user: AuthUser) {
    const c = await this.changes.findOne({ _id: id, ...this.scope(user) } as never).lean();
    if (!c) throw new NotFoundException('Request not found');
    return this.view(c, user);
  }

  async counts(user: AuthUser) {
    const rows = await this.changes.aggregate([{ $match: this.scope(user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }
}
