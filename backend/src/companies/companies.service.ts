import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, ReviewStatus, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import type { CreateCompanyDto, ListCompaniesQueryDto } from './dto/company.dto';
import { Company } from './schemas/company.schema';
import { RecruiterCompany } from './schemas/recruiter-company.schema';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name) private readonly companies: Model<Company>,
    @InjectModel(RecruiterCompany.name) private readonly links: Model<RecruiterCompany>,
    private readonly events: EventBusService,
  ) {}

  /** Recruiters submit a company for review; Admin-created companies are approved straight away. */
  async create(dto: CreateCompanyDto, user: AuthUser) {
    const exists = await this.companies.findOne({ name: new RegExp(`^${esc(dto.name.trim())}$`, 'i') }).lean();
    if (exists) throw new ConflictException({ message: 'A company with this name already exists', code: 'COMPANY_EXISTS' });

    const byAdmin = user.role === Role.ADMIN;
    const now = new Date();
    const company = await this.companies.create({
      ...dto, name: dto.name.trim(), country: dto.country?.toUpperCase(),
      approvalStatus: byAdmin ? ReviewStatus.APPROVED : ReviewStatus.PENDING_REVIEW,
      submittedAt: now, createdBy: new Types.ObjectId(user.id),
      ...(byAdmin ? { reviewedBy: new Types.ObjectId(user.id), reviewedAt: now } : {}),
    });
    if (!byAdmin) {
      await this.links.create({ recruiterUserId: user.id, companyId: company._id, approvalStatus: ReviewStatus.PENDING_REVIEW });
    }
    await this.events.publish(DomainEvent.COMPANY_SUBMITTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Company', id: company.id }, data: { name: company.name },
    });
    return this.view(company.toObject(), byAdmin ? undefined : ReviewStatus.PENDING_REVIEW);
  }

  /** A recruiter asks to represent a company that already exists. */
  async requestLink(companyId: string, user: AuthUser) {
    const company = await this.companies.findById(companyId).lean();
    if (!company || company.approvalStatus !== ReviewStatus.APPROVED) throw new NotFoundException('Company not found');
    const existing = await this.links.findOne({ recruiterUserId: user.id, companyId }).lean();
    if (existing) throw new ConflictException({ message: 'You have already requested this company', code: 'LINK_EXISTS' });
    await this.links.create({ recruiterUserId: user.id, companyId, approvalStatus: ReviewStatus.PENDING_REVIEW });
    return { companyId, linkStatus: ReviewStatus.PENDING_REVIEW };
  }

  private view(c: any, linkStatus?: ReviewStatus) {
    const { _id, __v, ...rest } = c;
    return { id: String(_id), ...rest, ...(linkStatus ? { linkStatus } : {}) };
  }

  /** Admin: every company. Recruiter: only companies they are linked to, with their link status. */
  async list(q: ListCompaniesQueryDto, user: AuthUser) {
    if (user.role === Role.ADMIN) {
      const filter: Record<string, unknown> = {};
      if (q.approvalStatus) filter.approvalStatus = q.approvalStatus;
      const { items, meta } = await paginate(this.companies, filter, q, {
        sortable: ['createdAt', 'name', 'submittedAt'], defaultSort: '-createdAt', searchFields: ['name', 'industry', 'location'],
      });
      return { items: items.map((c) => this.view(c)), meta };
    }
    const mine = await this.links.find({ recruiterUserId: user.id }).lean();
    const status = new Map(mine.map((l) => [String(l.companyId), l.approvalStatus]));
    const { items, meta } = await paginate(this.companies, { _id: { $in: mine.map((l) => l.companyId) } }, q, {
      sortable: ['createdAt', 'name'], defaultSort: 'name', searchFields: ['name', 'industry', 'location'],
    });
    return { items: items.map((c: any) => this.view(c, status.get(String(c._id)))), meta };
  }

  /** Companies this recruiter may post openings for (company approved AND link approved). */
  async usableByRecruiter(userId: string) {
    const links = await this.links.find({ recruiterUserId: userId, approvalStatus: ReviewStatus.APPROVED }).lean();
    const items = await this.companies.find({ _id: { $in: links.map((l) => l.companyId) }, approvalStatus: ReviewStatus.APPROVED }).sort({ name: 1 }).lean();
    return items.map((c) => this.view(c));
  }

  async assertRecruiterCanPost(userId: string, companyId: string) {
    const link = await this.links.findOne({ recruiterUserId: userId, companyId, approvalStatus: ReviewStatus.APPROVED }).lean();
    const company = link && (await this.companies.findOne({ _id: companyId, approvalStatus: ReviewStatus.APPROVED }).lean());
    if (!company) throw new ForbiddenException({ message: 'You are not approved to post openings for this company', code: 'COMPANY_NOT_AUTHORISED' });
    return company;
  }

  async counts() {
    const rows = await this.companies.aggregate([{ $group: { _id: '$approvalStatus', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  private async decide(id: string, admin: AuthUser, status: ReviewStatus, note: string | undefined, event: DomainEvent) {
    const company = await this.companies.findById(id);
    if (!company) throw new NotFoundException('Company not found');
    const previous = company.approvalStatus;
    Object.assign(company, { approvalStatus: status, reviewedBy: new Types.ObjectId(admin.id), reviewedAt: new Date(), reviewNote: note });
    await company.save();
    // Approving a company also approves the recruiter links that were waiting on it.
    if (status === ReviewStatus.APPROVED) {
      await this.links.updateMany({ companyId: id, approvalStatus: ReviewStatus.PENDING_REVIEW }, { approvalStatus: ReviewStatus.APPROVED, reviewedBy: admin.id, reviewedAt: new Date() });
    }
    await this.events.publish(event, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Company', id }, reason: note,
      previousState: { approvalStatus: previous }, newState: { approvalStatus: status }, data: { name: company.name },
    });
    return { id, approvalStatus: status };
  }

  /** Approve or reject a recruiter's request to represent an already-approved company. */
  async decideLink(linkId: string, admin: AuthUser, approve: boolean, note?: string) {
    const link = await this.links.findOneAndUpdate(
      { _id: linkId, approvalStatus: ReviewStatus.PENDING_REVIEW },
      { approvalStatus: approve ? ReviewStatus.APPROVED : ReviewStatus.REJECTED, reviewedBy: new Types.ObjectId(admin.id), reviewedAt: new Date(), reviewNote: note },
      { returnDocument: 'after' },
    );
    if (!link) throw new ConflictException({ message: 'This request is no longer pending', code: 'NOT_PENDING' });
    const company = await this.companies.findById(link.companyId).select('name').lean();
    await this.events.publish(approve ? DomainEvent.COMPANY_LINK_APPROVED : DomainEvent.COMPANY_LINK_REJECTED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'RecruiterCompany', id: linkId }, reason: note,
      previousState: { approvalStatus: ReviewStatus.PENDING_REVIEW }, newState: { approvalStatus: link.approvalStatus },
      data: { companyName: company?.name, recruiterId: String(link.recruiterUserId) },
    });
    return { id: linkId, approvalStatus: link.approvalStatus };
  }

  /** Sets or clears a company's logo (an image already stored as a public asset). */
  async setLogo(id: string, logoUrl: string | null) {
    const c = await this.companies.findByIdAndUpdate(id, logoUrl ? { logoUrl } : { $unset: { logoUrl: 1 } }, { returnDocument: 'after' }).lean();
    if (!c) throw new NotFoundException('Company not found');
    return { id, logoUrl: c.logoUrl ?? null };
  }

  approve(id: string, admin: AuthUser, note?: string) { return this.decide(id, admin, ReviewStatus.APPROVED, note, DomainEvent.COMPANY_APPROVED); }
  reject(id: string, admin: AuthUser, note: string) { return this.decide(id, admin, ReviewStatus.REJECTED, note, DomainEvent.COMPANY_REJECTED); }
  requestChanges(id: string, admin: AuthUser, note: string) { return this.decide(id, admin, ReviewStatus.CHANGES_REQUESTED, note, DomainEvent.COMPANY_CHANGES_REQUESTED); }
}
