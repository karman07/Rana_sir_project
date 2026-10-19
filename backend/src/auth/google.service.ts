import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { App } from 'firebase-admin/app';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env';

export interface GoogleIdentity { sub: string; email: string; name: string; picture?: string }

/**
 * Verifies the identity token the browser gets after "Continue with Google".
 * Firebase is preferred (service account in env); a plain Google client id still works as a fallback.
 */
@Injectable()
export class GoogleService {
  private readonly log = new Logger(GoogleService.name);
  private client?: OAuth2Client;
  private firebase?: App | null;
  constructor(private readonly config: ConfigService<Env, true>) {}

  get clientId() { return this.config.get('GOOGLE_CLIENT_ID') as string | undefined; }
  private get firebaseConfigured() { return !!(this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON') || this.config.get('FIREBASE_SERVICE_ACCOUNT_PATH')); }
  get enabled() { return this.firebaseConfigured || !!this.clientId; }

  // firebase-admin is only loaded once it is actually needed.
  private async firebaseApp(): Promise<App | null> {
    if (this.firebase !== undefined) return this.firebase;
    const json = this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON') as string | undefined;
    const path = this.config.get('FIREBASE_SERVICE_ACCOUNT_PATH') as string | undefined;
    try {
      if (!json && !path) return (this.firebase = null);
      const { cert, getApps, initializeApp } = await import('firebase-admin/app');
      const account = JSON.parse(json ?? readFileSync(resolve(process.cwd(), path!), 'utf8'));
      this.firebase = getApps()[0] ?? initializeApp({ credential: cert(account) });
    } catch (e) {
      this.log.error(`Firebase is configured but could not start: ${(e as Error).message}`);
      this.firebase = null;
    }
    return this.firebase;
  }

  async verify(credential: string): Promise<GoogleIdentity> {
    const app = await this.firebaseApp();
    if (app) {
      try {
        const { getAuth } = await import('firebase-admin/auth');
        const t = await getAuth(app).verifyIdToken(credential);
        if (!t.email || !t.email_verified) throw new Error('unverified');
        return { sub: t.uid, email: t.email.toLowerCase(), name: (t.name as string | undefined) ?? t.email.split('@')[0], picture: t.picture };
      } catch {
        throw new UnauthorizedException({ message: 'Google sign-in failed', code: 'GOOGLE_INVALID' });
      }
    }
    if (!this.clientId) throw new ServiceUnavailableException({ message: 'Google sign-in is not configured', code: 'GOOGLE_DISABLED' });
    this.client ??= new OAuth2Client(this.clientId);
    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: this.clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified) throw new Error('unverified');
      return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email.split('@')[0], picture: p.picture };
    } catch {
      throw new UnauthorizedException({ message: 'Google sign-in failed', code: 'GOOGLE_INVALID' });
    }
  }
}
