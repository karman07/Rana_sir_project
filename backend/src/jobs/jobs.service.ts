import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, JobStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import type { ListJobsQueryDto } from './dto/job.dto';
import { Application } from '../applications/schemas/application.schema';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { CommissionRulesService } from '../commissions/commission-rules.service';
import { JobPricingService } from './job-pricing.service';
import { Job } from './schemas/job.schema';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (s: string) => new RegExp(esc(s.trim()), 'i');

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Application.name) private readonly applications: Model<Application>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    private readonly events: EventBusService,
    private readonly pricing: JobPricingService,
    private readonly commissionRules: CommissionRulesService,
  ) {}

  /**
   * Candidates can only ever read PUBLISHED jobs and never see internal fields (recruiter, admin notes,
   * special instructions). Visibility is decided here, in the query, not by the frontend.
   */
  private present(job: any, user: AuthUser) {
    const { _id, __v, companyId, recruiterId, spec, approvedBy, deletedAt, jobRequestId, ...rest } = job;
    const company = companyId && typeof companyId === 'object' ? { id: String(companyId._id), name: companyId.name, industry: companyId.industry, location: companyId.location, logoUrl: companyId.logoUrl } : { id: String(companyId) };
    if (user.role === Role.CANDIDATE) {
      const { details, ...publicSpec } = spec;
      const { specialInstructions, ...publicDetails } = details ?? {};
      return { id: String(_id), jobNumber: rest.jobNumber, status: rest.status, publishedAt: rest.publishedAt, company, spec: { ...publicSpec, details: publicDetails } };
    }
    return { id: String(_id), ...rest, company, recruiterId: String(recruiterId), jobRequestId: String(jobRequestId), spec };
  }

  /** Candidates and the public see the pay that is left after our commission, never the company's figure. */
  private async presentFor(job: any, user: AuthUser) {
    const out: any = this.present(job, user);
    if (user.role === Role.CANDIDATE && out.spec?.compensation) out.spec = { ...out.spec, compensation: await this.pricing.candidateCompensation(job) };
    return out;
  }

  private visibility(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.CANDIDATE) return { status: JobStatus.PUBLISHED };
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id) };
    return {};
  }

  async list(q: ListJobsQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.visibility(user);
    if (user.role !== Role.CANDIDATE && q.status) filter.status = q.status;
    if (q.companyId) filter.companyId = new Types.ObjectId(q.companyId);
    if (q.location) filter['spec.location'] = rx(q.location);
    if (q.department) filter['spec.department'] = rx(q.department);
    if (q.employmentType) filter['spec.employmentType'] = q.employmentType;
    if (q.workMode) filter['spec.workMode'] = q.workMode;
    if (q.remote) filter['spec.workMode'] = 'REMOTE';
    if (q.maxExperience !== undefined) filter['spec.requirements.experienceMin'] = { $lte: q.maxExperience };
    if (q.minSalary !== undefined && q.currency) {
      filter['spec.compensation.currency'] = q.currency.toUpperCase();
      filter['spec.compensation.salaryMax'] = { $gte: q.minSalary };
    }
    if (q.skill) filter['spec.requirements.technicalSkills'] = rx(q.skill);
    if (q.saved && user.role === Role.CANDIDATE) {
      const p = await this.profiles.findOne({ userId: user.id }).select('savedJobIds').lean();
      filter._id = { $in: p?.savedJobIds ?? [] };
    }

    const { items, meta } = await paginate(this.jobs, filter, q, {
      sortable: ['publishedAt', 'createdAt', 'spec.title', 'jobNumber'],
      defaultSort: '-publishedAt',
      searchFields: ['spec.title', 'spec.department', 'spec.location', 'jobNumber', 'spec.requirements.technicalSkills'],
      populate: 'companyId',
    });
    return { items: await this.withCandidateFlags(await Promise.all(items.map((j) => this.presentFor(j, user))), user), meta };
  }

  async get(id: string, user: AuthUser) {
    const job = await this.jobs.findOne({ _id: id, ...this.visibility(user) }).populate('companyId').lean();
    if (!job) throw new NotFoundException('Job not found');
    return (await this.withCandidateFlags([await this.presentFor(job, user)], user))[0];
  }

  /** Candidates also learn whether they saved or already applied to each job. */
  private async withCandidateFlags<T extends { id: string }>(items: T[], user: AuthUser) {
    if (user.role !== Role.CANDIDATE || !user.id || !items.length) return items;
    const [profile, applied] = await Promise.all([
      this.profiles.findOne({ userId: user.id }).select('savedJobIds').lean(),
      this.applications.find({ candidateId: user.id as never, jobId: { $in: items.map((i) => i.id) } as never }).select('jobId status').lean(),
    ]);
    const saved = new Set((profile?.savedJobIds ?? []).map(String));
    const byJob = new Map(applied.map((a) => [String(a.jobId), a]));
    return items.map((i) => ({ ...i, saved: saved.has(i.id), application: byJob.has(i.id) ? { id: String(byJob.get(i.id)!._id), status: byJob.get(i.id)!.status } : null }));
  }

  /** Admin changes our commission on one opening, at any point before it closes. Contracts already signed keep the rate they were agreed with. */
  async setCommission(id: string, commission: { type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number }, admin: AuthUser) {
    const job = await this.jobs.findById(id).lean();
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === JobStatus.CLOSED) throw new ConflictException({ message: 'A closed opening cannot be changed', code: 'NOT_EDITABLE' });
    this.pricing.validate(commission, job.spec, true);
    await this.commissionRules.create({ scope: 'JOB', refId: id, type: commission.type, percent: commission.percent, amount: commission.amount, currency: job.spec?.compensation?.currency ?? 'USD', note: 'Changed by Admin' }, admin);
    return this.pricing.forAdmin(job, job.recruiterId);
  }

  /** Nothing goes live without our commission being set. */
  async publish(id: string, admin: AuthUser, commission?: { type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number }) {
    const existing = await this.jobs.findOne({ _id: id, status: JobStatus.APPROVED }).lean();
    if (!existing) throw new ConflictException({ message: 'Only approved, unpublished jobs can be published', code: 'NOT_PUBLISHABLE' });
    this.pricing.validate(commission, existing.spec);
    if (commission) {
      await this.commissionRules.create({ scope: 'JOB', refId: id, type: commission.type, percent: commission.percent, amount: commission.amount, currency: existing.spec?.compensation?.currency ?? 'USD', note: 'Set when the opening was published' }, admin);
    } else if (!(await this.pricing.hasJobCommission(id))) {
      throw new BadRequestException({ message: 'Set our commission before publishing. No opening goes live without one', code: 'COMMISSION_REQUIRED' });
    }
    const job = await this.jobs.findOneAndUpdate({ _id: id, status: JobStatus.APPROVED }, { status: JobStatus.PUBLISHED, publishedAt: new Date() }, { returnDocument: 'after' });
    if (!job) throw new ConflictException({ message: 'Only approved, unpublished jobs can be published', code: 'NOT_PUBLISHABLE' });
    await this.events.publish(DomainEvent.JOB_APPROVED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Job', id }, previousState: { status: JobStatus.APPROVED }, newState: { status: JobStatus.PUBLISHED },
      data: { jobNumber: job.jobNumber, title: job.spec?.title },
    });
    return { id, status: job.status };
  }

  async close(id: string, user: AuthUser, reason?: string) {
    const job = await this.jobs.findOne({ _id: id });
    if (!job) throw new NotFoundException('Job not found');
    if (user.role === Role.RECRUITER && String(job.recruiterId) !== user.id) throw new NotFoundException('Job not found');
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    if (job.status === JobStatus.CLOSED) throw new ConflictException({ message: 'Job is already closed', code: 'ALREADY_CLOSED' });
    const previous = job.status;
    Object.assign(job, { status: JobStatus.CLOSED, closedAt: new Date(), closeReason: reason });
    await job.save();
    await this.events.publish(DomainEvent.JOB_CLOSED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Job', id }, reason, previousState: { status: previous }, newState: { status: JobStatus.CLOSED },
      data: { jobNumber: job.jobNumber, title: job.spec?.title },
    });
    return { id, status: job.status };
  }
}
