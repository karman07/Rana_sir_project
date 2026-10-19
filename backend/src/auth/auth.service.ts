import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, ReviewStatus, Role, UserStatus, currencyForCountry } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import { EventBusService } from '../common/events/event-bus.service';
import { MailService } from '../common/mail/mail.service';
import type { Env } from '../config/env';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import { AuthTokenPurpose } from '../users/schemas/auth-token.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import type { RegisterCandidateDto, RegisterRecruiterDto } from './dto/auth.dto';
import { GoogleService } from './google.service';
import { SessionMeta, TokenService } from './token.service';

const BCRYPT_COST = 12;
// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  country?: string;
  currency?: string;
  avatarUrl?: string;
  recruiter?: { approvalStatus: ReviewStatus; reviewNote?: string; agencyName?: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly google: GoogleService,
    private readonly mail: MailService,
    private readonly events: EventBusService,
    private readonly config: ConfigService<Env, true>,
    @InjectModel(CandidateProfile.name) private readonly candidates: Model<CandidateProfile>,
    @InjectModel(RecruiterProfile.name) private readonly recruiters: Model<RecruiterProfile>,
  ) {}

  private link(path: string, token: string) {
    return `${this.config.get('WEB_ORIGIN')}${path}?token=${token}`;
  }

  async toSessionUser(user: UserDocument): Promise<SessionUser> {
    const out: SessionUser = {
      id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified,
      country: user.country, currency: user.currency ?? currencyForCountry(user.country), avatarUrl: user.avatarUrl,
    };
    if (user.role === Role.RECRUITER) {
      const p = await this.recruiters.findOne({ userId: user.id }).lean();
      if (p) out.recruiter = { approvalStatus: p.approvalStatus, reviewNote: p.reviewNote, agencyName: p.agencyName };
    }
    return out;
  }

  private async startSession(user: UserDocument, meta: SessionMeta) {
    user.lastLoginAt = new Date();
    await user.save();
    return { user: await this.toSessionUser(user), tokens: await this.tokens.issue(user.id, user.role, meta) };
  }

  private get requireVerification() { return process.env.REQUIRE_EMAIL_VERIFICATION !== 'false'; }

  /** With verification on, a new password account gets no session until the emailed link is used. */
  private async afterRegister(user: UserDocument, meta: SessionMeta) {
    if (this.requireVerification && !user.emailVerified) return { user: await this.toSessionUser(user), tokens: null, verificationRequired: true as const };
    return this.startSession(user, meta);
  }

  /** Public "resend" for someone who cannot sign in yet. Always answers the same way. */
  async resendVerificationByEmail(email: string) {
    const user = await this.users.findByEmail(email, true);
    if (user && !user.emailVerified && user.passwordHash) await this.sendVerification(user);
  }

  private async sendVerification(user: UserDocument) {
    const token = await this.tokens.createOneTimeToken(user.id, AuthTokenPurpose.VERIFY_EMAIL, 24);
    await this.mail.send({ to: user.email, template: 'account-verification', vars: { name: user.name, link: this.link('/verify-email', token) } });
  }

  private async assertEmailFree(email: string) {
    if (await this.users.findByEmail(email)) throw new ConflictException({ message: 'An account with this email already exists', code: 'EMAIL_TAKEN' });
  }

  async registerCandidate(dto: RegisterCandidateDto, meta: SessionMeta) {
    await this.assertEmailFree(dto.email);
    const user = await this.users.create({
      email: dto.email, name: dto.name, role: Role.CANDIDATE, phone: dto.phone, country: dto.country?.toUpperCase(),
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
    });
    await this.candidates.create({ userId: user._id });
    await this.sendVerification(user);
    await this.events.publish(DomainEvent.CANDIDATE_REGISTERED, {
      actor: { id: user.id, role: Role.CANDIDATE }, entity: { type: 'User', id: user.id }, data: { name: user.name, email: user.email },
    });
    return this.afterRegister(user, meta);
  }

  async registerRecruiter(dto: RegisterRecruiterDto, meta: SessionMeta) {
    await this.assertEmailFree(dto.email);
    const user = await this.users.create({
      email: dto.email, name: dto.name, role: Role.RECRUITER, phone: dto.phone, country: dto.country?.toUpperCase(),
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
    });
    await this.createPendingRecruiter(user, dto.agencyName);
    await this.sendVerification(user);
    return this.afterRegister(user, meta);
  }

  private async createPendingRecruiter(user: UserDocument, agencyName?: string) {
    await this.recruiters.create({ userId: user._id, agencyName, approvalStatus: ReviewStatus.PENDING_REVIEW, submittedAt: new Date() });
    await this.events.publish(DomainEvent.RECRUITER_REGISTERED, {
      actor: { id: user.id, role: Role.RECRUITER }, entity: { type: 'RecruiterProfile', id: user.id },
      data: { name: user.name, email: user.email, agencyName },
    });
  }

  async login(email: string, password: string, meta: SessionMeta) {
    const user = await this.users.findByEmail(email, true);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException({ message: 'Incorrect email or password', code: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException({ message: 'This account is suspended', code: 'SUSPENDED' });
    if (!user.emailVerified && this.requireVerification) {
      await this.sendVerification(user); // they just proved the password, so it is safe to resend
      throw new ForbiddenException({ message: 'Please confirm your email first. We have sent you a new link.', code: 'EMAIL_NOT_VERIFIED' });
    }
    return this.startSession(user, meta);
  }

  async loginWithGoogle(credential: string, intent: 'CANDIDATE' | 'RECRUITER' | undefined, meta: SessionMeta) {
    const g = await this.google.verify(credential);
    let user = await this.users.findByGoogleId(g.sub);
    if (!user) {
      user = await this.users.findByEmail(g.email);
      if (user) {
        // Google verified this email, so it is safe to link to the existing account.
        user.googleId = g.sub;
        user.emailVerified = true;
        user.avatarUrl ??= g.picture;
        await user.save();
      }
    }
    if (!user) {
      const role = intent === 'RECRUITER' ? Role.RECRUITER : Role.CANDIDATE;
      user = await this.users.create({ email: g.email, name: g.name, role, googleId: g.sub, emailVerified: true, avatarUrl: g.picture });
      if (role === Role.CANDIDATE) {
        await this.candidates.create({ userId: user._id });
        await this.events.publish(DomainEvent.CANDIDATE_REGISTERED, {
          actor: { id: user.id, role }, entity: { type: 'User', id: user.id }, data: { name: user.name, email: user.email },
        });
      } else {
        await this.createPendingRecruiter(user);
      }
    }
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException({ message: 'This account is suspended', code: 'SUSPENDED' });
    return this.startSession(user, meta);
  }

  async refresh(refreshToken: string, meta: SessionMeta) {
    const { userId, tokens } = await this.tokens.rotate(
      refreshToken,
      async (id) => {
        const u = await this.users.findById(id);
        return u && u.status === UserStatus.ACTIVE ? u.role : null;
      },
      meta,
    );
    const user = (await this.users.findById(userId))!;
    return { user: await this.toSessionUser(user), tokens };
  }

  logout(refreshToken?: string) {
    return refreshToken ? this.tokens.revoke(refreshToken) : undefined;
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.toSessionUser(user);
  }

  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    if (user && user.status === UserStatus.ACTIVE) {
      const token = await this.tokens.createOneTimeToken(user.id, AuthTokenPurpose.RESET_PASSWORD, 1);
      await this.mail.send({ to: user.email, template: 'password-reset', vars: { name: user.name, link: this.link('/reset-password', token) } });
    }
    // Same outcome either way: never reveal whether an email is registered.
  }

  /** Also completes recruiter invitations (INVITE tokens set the first password). */
  async resetPassword(token: string, password: string) {
    const t = await this.tokens.consumeOneTimeToken(token, [AuthTokenPurpose.RESET_PASSWORD, AuthTokenPurpose.INVITE]);
    const user = await this.users.findById(String(t.userId));
    if (!user) throw new UnauthorizedException({ message: 'This link is invalid or has expired', code: 'INVALID_TOKEN' });
    user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    user.emailVerified = true;
    await user.save();
    await this.tokens.revokeAllForUser(user.id);
    await this.events.publish(DomainEvent.PASSWORD_RESET, {
      actor: { id: user.id, role: user.role }, entity: { type: 'User', id: user.id }, data: { name: user.name, email: user.email },
    });
  }

  async verifyEmail(token: string) {
    const t = await this.tokens.consumeOneTimeToken(token, [AuthTokenPurpose.VERIFY_EMAIL]);
    await this.users.markEmailVerified(String(t.userId));
  }

  async resendVerification(userId: string) {
    const user = await this.users.findById(userId);
    if (user && !user.emailVerified) await this.sendVerification(user);
  }
}
