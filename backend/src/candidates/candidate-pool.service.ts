import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role } from '@rms/shared';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { Model, Types } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { DocumentFile } from '../documents/schemas/document.schema';
import { User } from '../users/schemas/user.schema';
import { CandidateProfile } from './schemas/candidate-profile.schema';

export class CandidatePoolQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(60) skill?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) @Max(60) minExperience?: number;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTS: Record<string, string> = { createdAt: 'createdAt', name: 'name', experience: 'profile.experienceYears', applications: 'applicationCount' };

/** Admin's view of every candidate on the platform. */
@Injectable()
export class CandidatePoolService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(DocumentFile.name) private readonly docs: Model<DocumentFile>,
  ) {}

  async list(q: CandidatePoolQueryDto) {
    const sortKey = q.sort?.replace(/^-/, '') ?? 'createdAt';
    const sort = { [SORTS[sortKey] ?? 'createdAt']: q.sort?.startsWith('-') || !q.sort ? -1 : 1, _id: 1 } as Record<string, 1 | -1>;
    const rx = q.search?.trim() ? new RegExp(esc(q.search.trim()), 'i') : null;
    const [out] = await this.users.aggregate([
      { $match: { role: Role.CANDIDATE, deletedAt: null, ...(q.country ? { country: q.country.toUpperCase() } : {}) } },
      { $lookup: { from: 'candidateprofiles', localField: '_id', foreignField: 'userId', as: 'profile' } },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      ...(rx ? [{ $match: { $or: [{ name: rx }, { email: rx }, { 'profile.headline': rx }, { 'profile.location': rx }] } }] : []),
      ...(q.skill ? [{ $match: { 'profile.skills': new RegExp(esc(q.skill.trim()), 'i') } }] : []),
      ...(q.minExperience !== undefined ? [{ $match: { 'profile.experienceYears': { $gte: q.minExperience } } }] : []),
      { $lookup: { from: 'applications', localField: '_id', foreignField: 'candidateId', as: 'apps' } },
      { $addFields: { applicationCount: { $size: '$apps' }, latest: { $arrayElemAt: [{ $sortArray: { input: '$apps', sortBy: { createdAt: -1 } } }, 0] } } },
      { $sort: sort },
      { $facet: {
        items: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }, { $project: {
          _id: 0, id: '$_id', name: 1, email: 1, country: 1, status: 1, emailVerified: 1, createdAt: 1, headline: '$profile.headline', location: '$profile.location',
          experienceYears: '$profile.experienceYears', skills: '$profile.skills', expectedSalary: '$profile.expectedSalary', noticePeriodDays: '$profile.noticePeriodDays',
          applicationCount: 1, latestStatus: '$latest.status',
        } }],
        total: [{ $count: 'n' }],
      } },
    ]);
    const total = out.total[0]?.n ?? 0;
    return { items: out.items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
  }

  async get(id: string) {
    const user = await this.users.findOne({ _id: id, role: Role.CANDIDATE }).lean();
    if (!user) throw new NotFoundException('Candidate not found');
    const [profile, applications, documents] = await Promise.all([
      this.profiles.findOne({ userId: id }).lean(),
      this.apps.find({ candidateId: new Types.ObjectId(id) }).populate('jobId', 'jobNumber spec.title spec.location').populate('companyId', 'name').sort({ createdAt: -1 }).lean(),
      this.docs.find({ ownerId: id as never }).sort({ createdAt: -1 }).lean(),
    ]);
    const { _id, __v, userId, savedJobIds, deletedAt, ...p } = (profile ?? {}) as any;
    return {
      user: { id: String(user._id), name: user.name, email: user.email, phone: user.phone, country: user.country, status: user.status, emailVerified: user.emailVerified, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
      profile: p,
      applications: applications.map((a: any) => ({ id: String(a._id), applicationNumber: a.applicationNumber, status: a.status, createdAt: a.createdAt, job: { id: String(a.jobId?._id), jobNumber: a.jobId?.jobNumber, title: a.jobId?.spec?.title, location: a.jobId?.spec?.location }, company: a.companyId?.name, adminScore: a.adminScore, expectedSalary: a.expectedSalary })),
      documents: documents.map((d: any) => ({ id: String(d._id), type: d.type, label: d.label, version: d.version, status: d.status, originalName: d.originalName, size: d.size, createdAt: d.createdAt })),
    };
  }
}
