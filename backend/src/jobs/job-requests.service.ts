import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, JobRequestStatus, JobStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { CommissionRulesService } from '../commissions/commission-rules.service';
import { JobPricingService } from './job-pricing.service';
import { diffSpec } from './job-spec-diff';
import type { AuthUser } from '../auth/decorators';
import { CompaniesService } from '../companies/companies.service';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import { UsersService } from '../users/users.service';
import type { CreateJobRequestDto, ListJobRequestsQueryDto, UpdateJobRequestDto } from './dto/job.dto';
import type { JobSpecDto } from './dto/job-spec.dto';
import { validateForSubmission } from './job-spec.validation';
import { Job } from './schemas/job.schema';
import { JobRequest, type JobRequestDocument } from './schemas/job-request.schema';

const EDITABLE: JobRequestStatus[] = [JobRequestStatus.DRAFT, JobRequestStatus.CHANGES_REQUESTED];
const plain = (x: any) => (x?.toObject ? x.toObject() : x);
const GROUPS = ['requirements', 'compensation', 'contract', 'details'] as const;

/** Scalars replace; nested groups merge key by key; arrays inside a group are replaced when provided. */
export function mergeSpec(current: Record<string, any> | undefined, patch: JobSpecDto | undefined) {
  const base: Record<string, any> = JSON.parse(JSON.stringify(current ?? {}));
  if (!patch) return base;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    // DTO class fields are materialised as `undefined` (ES2022 class fields), so only copy keys the client actually sent.
    if ((GROUPS as readonly string[]).includes(key)) base[key] = { ...(base[key] ?? {}), ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) };
    else base[key] = value;
  }
  return base;
}

@Injectable()
export class JobRequestsService {
  constructor(
    @InjectModel(JobRequest.name) private readonly requests: Model<JobRequest>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    private readonly companies: CompaniesService,
    private readonly users: UsersService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly pricing: JobPricingService,
    private readonly commissionRules: CommissionRulesService,
  ) {}

  private async load(id: string, user: AuthUser): Promise<JobRequestDocument> {
    const doc = await this.requests.findById(id);
    // 404 (not 403) so recruiters cannot probe for other agents' requests.
    if (!doc || (user.role === Role.RECRUITER && String(doc.recruiterId) !== user.id) || user.role === Role.CANDIDATE) {
      throw new NotFoundException('Job request not found');
    }
    return doc;
  }

  private async eventData(doc: JobRequestDocument) {
    const [company, recruiter] = await Promise.all([
      this.requests.db.model('Company').findById(doc.companyId).select('name').lean<{ name: string }>(),
      this.users.findById(String(doc.recruiterId)),
    ]);
    return { requestNumber: doc.requestNumber, title: doc.spec?.title, companyName: company?.name, recruiterId: String(doc.recruiterId), recruiterName: recruiter?.name, recruiterEmail: recruiter?.email, version: doc.version };
  }

  async create(dto: CreateJobRequestDto, user: AuthUser) {
    await this.companies.assertRecruiterCanPost(user.id, dto.companyId);
    const n = await this.counters.next('job-request');
    const doc = await this.requests.create({
      requestNumber: `JR-${String(n).padStart(4, '0')}`,
      recruiterId: new Types.ObjectId(user.id), companyId: new Types.ObjectId(dto.companyId),
      spec: mergeSpec(undefined, dto.spec),
    });
    return this.present(doc);
  }

  /** Admin can reshape a request while it waits for a decision. The recruiter's own versions stay as submitted. */
  private async adminEdit(id: string, dto: UpdateJobRequestDto, admin: AuthUser) {
    const doc = await this.load(id, admin);
    if (doc.status !== JobRequestStatus.PENDING_ADMIN_REVIEW) throw new ConflictException({ message: 'Only a request waiting for review can be edited here', code: 'NOT_EDITABLE' });
    const before = plain(doc.spec);
    const spec = mergeSpec(before, dto.spec);
    const problems = validateForSubmission(spec);
    if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
    const changed = diffSpec(before, spec);
    if (!changed.length) throw new BadRequestException({ message: 'Nothing has changed', code: 'NO_CHANGES' });
    const saved = await this.requests.findOneAndUpdate(
      { _id: doc._id, status: JobRequestStatus.PENDING_ADMIN_REVIEW },
      { $set: { spec }, $push: { reviews: { action: 'ADMIN_EDITED', byId: new Types.ObjectId(admin.id), byName: admin.name, byRole: Role.ADMIN, note: `Adjusted: ${changed.map((c) => c.label).join(', ')}`, version: doc.version, at: new Date() } } },
      { returnDocument: 'after' },
    );
    if (!saved) throw new ConflictException({ message: 'This request has just been decided', code: 'NOT_EDITABLE' });
    await this.events.publish(DomainEvent.JOB_UPDATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobRequest', id }, previousState: { spec: before }, newState: { fields: changed.map((c) => c.label) }, data: await this.eventData(saved),
    });
    return this.get(id, admin);
  }

  /** Admin can edit any opening that is approved or live, directly. (Recruiters ask through a change request.) */
  async adminEditJob(jobId: string, dto: UpdateJobRequestDto, admin: AuthUser) {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.APPROVED && job.status !== JobStatus.PUBLISHED) throw new ConflictException({ message: 'A closed opening cannot be edited', code: 'NOT_EDITABLE' });
    const before = plain(job.spec);
    const spec = mergeSpec(before, dto.spec);
    const problems = validateForSubmission(spec);
    if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
    const changed = diffSpec(before, spec);
    if (!changed.length) throw new BadRequestException({ message: 'Nothing has changed', code: 'NO_CHANGES' });
    // Our fixed commission must still leave the candidate something at the new pay.
    const { rule } = await this.commissionRules.resolve({ recruiterId: job.recruiterId, jobId: job._id });
    if (rule.type === 'FIXED') this.pricing.validate({ type: 'FIXED', amount: rule.amount }, spec);
    job.spec = spec as never;
    await job.save();
    await this.requests.updateOne({ _id: job.jobRequestId }, { $set: { spec }, $push: { reviews: { action: 'ADMIN_EDITED', byId: new Types.ObjectId(admin.id), byName: admin.name, byRole: Role.ADMIN, note: `Adjusted: ${changed.map((c) => c.label).join(', ')}`, version: 0, at: new Date() } } });
    await this.events.publish(DomainEvent.JOB_UPDATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Job', id: jobId }, previousState: { spec: before }, newState: { fields: changed.map((c) => c.label) }, data: { jobNumber: job.jobNumber, title: job.spec?.title },
    });
    return { id: jobId, status: job.status, changed: changed.map((c) => c.label) };
  }

  async update(id: string, dto: UpdateJobRequestDto, user: AuthUser) {
    if (user.role === Role.ADMIN) return this.adminEdit(id, dto, user);
    const doc = await this.load(id, user);
    const pending = doc.status === JobRequestStatus.PENDING_ADMIN_REVIEW;
    if (!EDITABLE.includes(doc.status) && !pending) {
      throw new ConflictException({ message: 'This request can no longer be edited', code: 'NOT_EDITABLE' });
    }
    if (dto.companyId && dto.companyId !== String(doc.companyId)) {
      if (doc.version > 0) throw new BadRequestException('The company cannot change after the request has been submitted');
      await this.companies.assertRecruiterCanPost(user.id, dto.companyId);
      doc.companyId = new Types.ObjectId(dto.companyId);
    }
    doc.spec = mergeSpec(plain(doc.spec), dto.spec) as any;
    if (pending) {
      // Changing a request that is already with Admin sends the new version straight back for review, so it can never be approved half-edited.
      const spec = plain(doc.spec);
      const problems = validateForSubmission(spec);
      if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
      doc.version += 1;
      doc.submittedAt = new Date();
      doc.revisions.push({ version: doc.version, submittedAt: doc.submittedAt, spec } as any);
      doc.reviews.push({ action: 'RESUBMITTED', byId: new Types.ObjectId(user.id), byName: user.name, byRole: user.role, version: doc.version, at: doc.submittedAt } as any);
      const saved = await this.requests.findOneAndUpdate({ _id: doc._id, status: JobRequestStatus.PENDING_ADMIN_REVIEW }, { $set: { spec: doc.spec, version: doc.version, submittedAt: doc.submittedAt, revisions: doc.revisions, reviews: doc.reviews } }, { returnDocument: 'after' });
      if (!saved) throw new ConflictException({ message: 'Our team has just decided on this request', code: 'NOT_EDITABLE' });
      await this.events.publish(DomainEvent.JOB_RESUBMITTED, {
        actor: { id: user.id, role: Role.RECRUITER }, entity: { type: 'JobRequest', id: saved.id },
        previousState: { status: saved.status }, newState: { status: saved.status, version: saved.version }, data: await this.eventData(saved),
      });
      return this.present(saved);
    }
    await doc.save();
    return this.present(doc);
  }

  async submit(id: string, user: AuthUser) {
    const doc = await this.load(id, user);
    if (!EDITABLE.includes(doc.status)) throw new ConflictException({ message: 'This request is already with our team or closed', code: 'NOT_EDITABLE' });
    await this.companies.assertRecruiterCanPost(user.id, String(doc.companyId));

    const spec = plain(doc.spec);
    const problems = validateForSubmission(spec);
    if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });

    const resubmission = doc.version > 0;
    const previous = doc.status;
    doc.version += 1;
    doc.status = JobRequestStatus.PENDING_ADMIN_REVIEW;
    doc.submittedAt = new Date();
    doc.revisions.push({ version: doc.version, submittedAt: doc.submittedAt, spec } as any);
    doc.reviews.push({ action: resubmission ? 'RESUBMITTED' : 'SUBMITTED', byId: new Types.ObjectId(user.id), byName: user.name, byRole: user.role, version: doc.version, at: doc.submittedAt } as any);
    await doc.save();

    await this.events.publish(resubmission ? DomainEvent.JOB_RESUBMITTED : DomainEvent.JOB_CREATED, {
      actor: { id: user.id, role: Role.RECRUITER }, entity: { type: 'JobRequest', id: doc.id },
      previousState: { status: previous }, newState: { status: doc.status, version: doc.version }, data: await this.eventData(doc),
    });
    return this.present(doc);
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.load(id, user);
    if (doc.status !== JobRequestStatus.DRAFT || doc.version > 0) {
      throw new ConflictException({ message: 'Only drafts that were never submitted can be deleted', code: 'NOT_DELETABLE' });
    }
    doc.deletedAt = new Date();
    await doc.save();
    return { id, deleted: true };
  }

  async list(q: ListJobRequestsQueryDto, user: AuthUser) {
    const filter: Record<string, unknown> = {};
    if (user.role === Role.RECRUITER) filter.recruiterId = new Types.ObjectId(user.id);
    else {
      if (q.recruiterId) filter.recruiterId = new Types.ObjectId(q.recruiterId);
      // Drafts are private to the recruiter until submitted.
      filter.status = q.status ?? { $ne: JobRequestStatus.DRAFT };
      if (q.status === JobRequestStatus.DRAFT) throw new ForbiddenException('Drafts are private to the recruiter');
    }
    if (user.role === Role.RECRUITER && q.status) filter.status = q.status;
    if (q.companyId) filter.companyId = new Types.ObjectId(q.companyId);

    const { items, meta } = await paginate(this.requests, filter, q, {
      sortable: ['createdAt', 'updatedAt', 'submittedAt', 'requestNumber'],
      defaultSort: user.role === Role.ADMIN && (!q.status || q.status === JobRequestStatus.PENDING_ADMIN_REVIEW) ? 'submittedAt' : '-updatedAt',
      searchFields: ['requestNumber', 'spec.title', 'spec.location'],
      select: '-revisions',
      populate: 'companyId',
    });
    const recruiters = user.role === Role.ADMIN ? await this.recruiterNames(items.map((i: any) => String(i.recruiterId))) : new Map();
    return { items: items.map((i: any) => this.present(i, recruiters.get(String(i.recruiterId)))), meta };
  }

  private async recruiterNames(ids: string[]) {
    const rows = await this.requests.db.model('User').find({ _id: { $in: ids } }).select('name email').lean<{ _id: Types.ObjectId; name: string; email: string }[]>();
    return new Map(rows.map((r) => [String(r._id), { id: String(r._id), name: r.name, email: r.email }]));
  }

  async get(id: string, user: AuthUser) {
    const doc = await this.load(id, user);
    if (user.role === Role.ADMIN && doc.status === JobRequestStatus.DRAFT) throw new NotFoundException('Job request not found');
    await doc.populate('companyId');
    const recruiter = (await this.recruiterNames([String(doc.recruiterId)])).get(String(doc.recruiterId));
    const out: any = this.present(doc, recruiter, true);
    // Only Admin sees the commission, and what candidates will be shown after it.
    if (user.role === Role.ADMIN) {
      const job = doc.jobId ? await this.jobs.findById(doc.jobId).lean() : null;
      out.commission = await this.pricing.forAdmin(job ?? { recruiterId: doc.recruiterId, spec: plain(doc.spec) }, doc.recruiterId);
    }
    return out;
  }

  private present(doc: any, recruiter?: unknown, full = false) {
    const o = doc.toObject ? doc.toObject() : doc;
    const populated = o.companyId && typeof o.companyId === 'object' && o.companyId.name;
    const { _id, __v, companyId, revisions, deletedAt, ...rest } = o;
    return {
      id: String(_id), ...rest,
      companyId: String(populated ? companyId._id : companyId),
      company: populated ? { id: String(companyId._id), name: companyId.name, industry: companyId.industry, location: companyId.location } : undefined,
      recruiter,
      ...(full ? { revisions } : {}),
    };
  }

  /* ---------------- Admin decisions ---------------- */

  /** Atomically claims a pending request so two admins cannot decide it twice. */
  private async claim(id: string, to: JobRequestStatus, admin: AuthUser, note: string | undefined, action: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
    const doc = await this.requests.findOne({ _id: id });
    if (!doc || doc.status === JobRequestStatus.DRAFT) throw new NotFoundException('Job request not found');
    const claimed = await this.requests.findOneAndUpdate(
      { _id: id, status: JobRequestStatus.PENDING_ADMIN_REVIEW },
      { status: to, $push: { reviews: { action, byId: admin.id, byName: admin.name, byRole: Role.ADMIN, note, version: doc.version, at: new Date() } } },
      { returnDocument: 'after' },
    );
    if (!claimed) throw new ConflictException({ message: 'This request is not awaiting review', code: 'NOT_PENDING' });
    return claimed;
  }

  async approve(id: string, admin: AuthUser, note?: string, publish = true, commission?: { type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number }) {
    const current = await this.requests.findById(id).select('spec status').lean();
    this.pricing.validate(commission, current?.spec, current?.status === JobRequestStatus.PENDING_ADMIN_REVIEW);
    const doc = await this.claim(id, JobRequestStatus.APPROVED, admin, note, 'APPROVED');
    try {
      const n = await this.counters.next('job', 1001);
      const now = new Date();
      const job = await this.jobs.create({
        jobNumber: `JOB-${n}`, jobRequestId: doc._id, recruiterId: doc.recruiterId, companyId: doc.companyId,
        status: publish ? JobStatus.PUBLISHED : JobStatus.APPROVED,
        spec: plain(doc.spec), approvedBy: new Types.ObjectId(admin.id), approvedAt: now, ...(publish ? { publishedAt: now } : {}),
      });
      doc.jobId = job._id;
      await doc.save();
      // Our cut on this opening: set here, applied to every contract and payment for it, and never shown to the recruiter or candidates.
      if (commission) {
        await this.commissionRules.create({ scope: 'JOB', refId: String(job._id), type: commission.type, percent: commission.percent, amount: commission.amount, currency: doc.spec?.compensation?.currency ?? 'USD', note: 'Set when the opening was approved' }, admin);
      }
      await this.events.publish(DomainEvent.JOB_APPROVED, {
        actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobRequest', id }, reason: note,
        previousState: { status: JobRequestStatus.PENDING_ADMIN_REVIEW }, newState: { status: JobRequestStatus.APPROVED, jobId: job.id, jobNumber: job.jobNumber, published: publish },
        data: await this.eventData(doc),
      });
      return { id, status: doc.status, jobId: job.id, jobNumber: job.jobNumber };
    } catch (err) {
      // Creating the job failed: put the request back so it can be retried.
      await this.requests.updateOne({ _id: id }, { status: JobRequestStatus.PENDING_ADMIN_REVIEW, $pop: { reviews: 1 } });
      throw err;
    }
  }

  async requestChanges(id: string, admin: AuthUser, note: string) {
    const doc = await this.claim(id, JobRequestStatus.CHANGES_REQUESTED, admin, note, 'CHANGES_REQUESTED');
    await this.events.publish(DomainEvent.JOB_CHANGES_REQUESTED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobRequest', id }, reason: note,
      previousState: { status: JobRequestStatus.PENDING_ADMIN_REVIEW }, newState: { status: JobRequestStatus.CHANGES_REQUESTED }, data: await this.eventData(doc),
    });
    return { id, status: doc.status };
  }

  async reject(id: string, admin: AuthUser, note: string) {
    const doc = await this.claim(id, JobRequestStatus.REJECTED, admin, note, 'REJECTED');
    await this.events.publish(DomainEvent.JOB_REJECTED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'JobRequest', id }, reason: note,
      previousState: { status: JobRequestStatus.PENDING_ADMIN_REVIEW }, newState: { status: JobRequestStatus.REJECTED }, data: await this.eventData(doc),
    });
    return { id, status: doc.status };
  }

  async counts(user: AuthUser) {
    const match = user.role === Role.RECRUITER ? { recruiterId: new Types.ObjectId(user.id) } : { status: { $ne: JobRequestStatus.DRAFT } };
    const rows = await this.requests.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }
}
