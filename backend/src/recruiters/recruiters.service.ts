import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, ReviewStatus, Role, UserStatus } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { AuthTokenPurpose } from '../users/schemas/auth-token.schema';
import { TokenService } from '../auth/token.service';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import { MailService } from '../common/mail/mail.service';
import { parseSort } from '../common/database/paginate';
import type { Env } from '../config/env';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import type { CreateRecruiterDto, ListRecruitersQueryDto } from './dto/recruiter.dto';
import { RecruiterProfile } from './schemas/recruiter-profile.schema';

const INVITE_TTL_HOURS = 7 * 24;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface CreatedRecruiterResult {
  ok: boolean;
  email: string;
  error?: string;
  recruiter?: { id: string; name: string; email: string };
  inviteUrl?: string;
}

@Injectable()
export class RecruitersService {
  constructor(
    @InjectModel(RecruiterProfile.name) private readonly profiles: Model<RecruiterProfile>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly events: EventBusService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private inviteUrl(token: string) {
    return `${this.config.get('WEB_ORIGIN')}/reset-password?token=${token}&invite=1`;
  }

  /** Admin-created recruiters are pre-approved; they set their own password through the invite link. */
  async createByAdmin(dto: CreateRecruiterDto, admin: AuthUser): Promise<CreatedRecruiterResult> {
    if (await this.users.findByEmail(dto.email)) {
      return { ok: false, email: dto.email, error: 'An account with this email already exists' };
    }
    const user = await this.users.create({
      email: dto.email, name: dto.name, role: Role.RECRUITER, phone: dto.phone, country: dto.country?.toUpperCase(), createdBy: admin.id,
    });
    await this.profiles.create({
      userId: user._id, agencyName: dto.agencyName, approvalStatus: ReviewStatus.APPROVED, submittedAt: new Date(),
      reviewedBy: new Types.ObjectId(admin.id), reviewedAt: new Date(), createdByAdmin: new Types.ObjectId(admin.id),
    });
    const inviteUrl = await this.sendInvite(user.id, user.name, user.email);
    await this.events.publish(DomainEvent.RECRUITER_CREATED_BY_ADMIN, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'RecruiterProfile', id: user.id },
      data: { name: user.name, email: user.email, agencyName: dto.agencyName },
    });
    return { ok: true, email: user.email, recruiter: { id: user.id, name: user.name, email: user.email }, inviteUrl };
  }

  async createMany(dtos: CreateRecruiterDto[], admin: AuthUser) {
    const results: CreatedRecruiterResult[] = [];
    for (const dto of dtos) {
      try {
        results.push(await this.createByAdmin(dto, admin));
      } catch (e) {
        results.push({ ok: false, email: dto.email, error: e instanceof ConflictException ? 'Duplicate email' : 'Could not create recruiter' });
      }
    }
    return { created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  private async sendInvite(userId: string, name: string, email: string) {
    const token = await this.tokens.createOneTimeToken(userId, AuthTokenPurpose.INVITE, INVITE_TTL_HOURS);
    const url = this.inviteUrl(token);
    await this.mail.send({ to: email, template: 'recruiter-invite', vars: { name, link: url } });
    return url;
  }

  async resendInvite(userId: string) {
    const user = await this.users.findById(userId);
    if (!user || user.role !== Role.RECRUITER) throw new NotFoundException('Recruiter not found');
    return { inviteUrl: await this.sendInvite(user.id, user.name, user.email) };
  }

  async list(q: ListRecruitersQueryDto) {
    const match: Record<string, unknown> = {};
    if (q.approvalStatus) match.approvalStatus = q.approvalStatus;
    const sortKey = parseSort(q.sort ?? 'submittedAt', { sortable: ['createdAt', 'submittedAt', 'name', 'email', 'approvalStatus'], defaultSort: 'submittedAt' });
    const search = q.search?.trim()
      ? (() => { const rx = new RegExp(esc(q.search!.trim()), 'i'); return { $or: [{ 'user.name': rx }, { 'user.email': rx }, { agencyName: rx }] }; })()
      : {};
    const mapped = Object.fromEntries(Object.entries(sortKey).map(([k, v]) => [k === 'name' || k === 'email' ? `user.${k}` : k, v === 'asc' ? 1 : v === 'desc' ? -1 : v]));

    const [out] = await this.profiles.aggregate([
      { $match: match },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.deletedAt': null, ...search } },
      { $sort: { ...mapped, _id: 1 } },
      {
        $facet: {
          items: [
            { $skip: (q.page - 1) * q.limit }, { $limit: q.limit },
            {
              $project: {
                _id: 0, id: '$userId', name: '$user.name', email: '$user.email', phone: '$user.phone', country: '$user.country',
                status: '$user.status', emailVerified: '$user.emailVerified', hasPassword: { $ne: [{ $type: '$user.passwordHash' }, 'missing'] },
                agencyName: 1, approvalStatus: 1, submittedAt: 1, reviewedAt: 1, reviewNote: 1, createdByAdmin: 1, createdAt: 1,
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    const total = out.total[0]?.n ?? 0;
    return { items: out.items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
  }

  async counts() {
    const rows = await this.profiles.aggregate([{ $group: { _id: '$approvalStatus', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  private async review(userId: string, admin: AuthUser, status: ReviewStatus, note: string | undefined, event: DomainEvent | null) {
    const profile = await this.profiles.findOne({ userId });
    if (!profile) throw new NotFoundException('Recruiter not found');
    const previous = profile.approvalStatus;
    profile.approvalStatus = status;
    profile.reviewedBy = new Types.ObjectId(admin.id);
    profile.reviewedAt = new Date();
    profile.reviewNote = note;
    await profile.save();
    if (event) {
      await this.events.publish(event, {
        actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'RecruiterProfile', id: userId },
        reason: note, previousState: { approvalStatus: previous }, newState: { approvalStatus: status },
      });
    }
    return { id: userId, approvalStatus: status };
  }

  approve(userId: string, admin: AuthUser, note?: string) {
    return this.review(userId, admin, ReviewStatus.APPROVED, note, DomainEvent.RECRUITER_ACCOUNT_APPROVED);
  }
  reject(userId: string, admin: AuthUser, note: string) {
    return this.review(userId, admin, ReviewStatus.REJECTED, note, DomainEvent.RECRUITER_ACCOUNT_REJECTED);
  }
  requestChanges(userId: string, admin: AuthUser, note: string) {
    return this.review(userId, admin, ReviewStatus.CHANGES_REQUESTED, note, DomainEvent.RECRUITER_ACCOUNT_CHANGES_REQUESTED);
  }

  async setUserStatus(userId: string, status: UserStatus, admin: AuthUser) {
    const user = await this.users.findById(userId);
    if (!user || user.role !== Role.RECRUITER) throw new NotFoundException('Recruiter not found');
    user.status = status;
    await user.save();
    if (status === UserStatus.SUSPENDED) await this.tokens.revokeAllForUser(user.id);
    await this.events.publish(status === UserStatus.SUSPENDED ? DomainEvent.USER_SUSPENDED : DomainEvent.USER_REACTIVATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'User', id: userId },
      data: { name: user.name, email: user.email }, newState: { status },
    });
    return { id: userId, status };
  }
}
