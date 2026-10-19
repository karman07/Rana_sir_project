import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Model, Types } from 'mongoose';
import type { Env } from '../config/env';
import { AuthToken, AuthTokenPurpose } from '../users/schemas/auth-token.schema';
import { RefreshSession } from '../users/schemas/refresh-session.schema';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');

export interface SessionMeta { userAgent?: string; ip?: string }
export interface IssuedTokens { accessToken: string; refreshToken: string; accessMaxAgeMs: number; refreshMaxAgeMs: number }

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSession>,
    @InjectModel(AuthToken.name) private readonly authTokens: Model<AuthToken>,
  ) {}

  private async sign(userId: string, role: string, family: string, meta: SessionMeta): Promise<IssuedTokens> {
    const accessMaxAgeMs = this.config.get('ACCESS_TOKEN_TTL_MIN') * 60_000;
    const refreshMaxAgeMs = this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000;
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: Math.floor(accessMaxAgeMs / 1000) },
    );
    const refreshToken = opaque();
    await this.sessions.create({
      userId, family, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + refreshMaxAgeMs), ...meta,
    });
    return { accessToken, refreshToken, accessMaxAgeMs, refreshMaxAgeMs };
  }

  issue(userId: string, role: string, meta: SessionMeta = {}) {
    return this.sign(userId, role, randomUUID(), meta);
  }

  /** Rotates a refresh token. Replaying an already-used token revokes the whole family (theft signal). */
  async rotate(refreshToken: string, role: (id: string) => Promise<string | null>, meta: SessionMeta = {}) {
    const session = await this.sessions.findOne({ tokenHash: sha256(refreshToken) });
    if (!session) throw new UnauthorizedException({ message: 'Invalid session', code: 'UNAUTHORIZED' });
    if (session.revokedAt) {
      await this.sessions.updateMany({ family: session.family, revokedAt: null }, { revokedAt: new Date() });
      throw new UnauthorizedException({ message: 'Session no longer valid', code: 'UNAUTHORIZED' });
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException({ message: 'Session expired', code: 'TOKEN_EXPIRED' });

    const userRole = await role(String(session.userId));
    if (!userRole) throw new UnauthorizedException({ message: 'Account unavailable', code: 'UNAUTHORIZED' });

    session.revokedAt = new Date();
    await session.save();
    const tokens = await this.sign(String(session.userId), userRole, session.family, meta);
    return { userId: String(session.userId), tokens };
  }

  async revoke(refreshToken: string) {
    const s = await this.sessions.findOne({ tokenHash: sha256(refreshToken) });
    if (s) await this.sessions.updateMany({ family: s.family, revokedAt: null }, { revokedAt: new Date() });
  }

  revokeAllForUser(userId: string | Types.ObjectId) {
    return this.sessions.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  }

  /** One-time tokens for email verification, password reset and recruiter invitations. Returns the raw token. */
  async createOneTimeToken(userId: string | Types.ObjectId, purpose: AuthTokenPurpose, ttlHours: number) {
    await this.authTokens.updateMany({ userId, purpose, usedAt: null }, { usedAt: new Date() });
    const raw = opaque();
    await this.authTokens.create({ userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) });
    return raw;
  }

  async consumeOneTimeToken(raw: string, purposes: AuthTokenPurpose[]) {
    const doc = await this.authTokens.findOneAndUpdate(
      { tokenHash: sha256(raw), purpose: { $in: purposes }, usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    );
    if (!doc) throw new UnauthorizedException({ message: 'This link is invalid or has expired', code: 'INVALID_TOKEN' });
    return doc;
  }
}
