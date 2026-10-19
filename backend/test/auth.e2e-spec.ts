import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { RequireApprovedRecruiter, Roles } from './../src/auth/decorators';
import { MailService } from './../src/common/mail/mail.service';
import { UsersService } from './../src/users/users.service';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

@Controller('probe')
class ProbeController {
  @Get('recruiter-only') @Roles(Role.RECRUITER) @RequireApprovedRecruiter() recruiterOnly() { return { ok: true }; }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

const PW = 'Sup3rSecret!';

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  const sent: { to: string; template: string; vars: Record<string, string> }[] = [];
  const lastLink = (template: string, to?: string) => {
    const m = [...sent].reverse().find((s) => s.template === template && (!to || s.to === to))!;
    return new URL(m.vars.link).searchParams.get('token')!;
  };
  const agent = () => request.agent(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] })
      .overrideProvider(MailService).useValue({ send: async (m: any) => { sent.push(m); } })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e'); // never wipe a real database
    await conn.dropDatabase();
    const users = moduleRef.get(UsersService);
    await users.create({ email: 'admin@test.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/recruiters').expect(401);
  });

  describe('candidate', () => {
    const a = () => agent();
    let c: ReturnType<typeof agent>;

    it('registers, sets httpOnly cookies and returns the session user without secrets', async () => {
      c = a();
      const res = await c.post('/api/auth/register/candidate').send({ name: 'Cara', email: 'Cara@Test.dev', password: PW, country: 'in' }).expect(201);
      expect(res.body.data.user).toMatchObject({ email: 'cara@test.dev', role: 'CANDIDATE', currency: 'INR' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token/i);
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((x) => x.startsWith('access_token=') && /HttpOnly/i.test(x))).toBe(true);
      expect(cookies.some((x) => x.startsWith('refresh_token=') && /HttpOnly/i.test(x) && /Path=\/api\/auth/.test(x))).toBe(true);
      await c.get('/api/auth/me').expect(200);
    });

    it('rejects weak passwords and duplicate emails', async () => {
      await a().post('/api/auth/register/candidate').send({ name: 'X Y', email: 'weak@test.dev', password: 'short' }).expect(400);
      await a().post('/api/auth/register/candidate').send({ name: 'Cara 2', email: 'cara@test.dev', password: PW }).expect(409);
    });

    it('verifies email with a one-time token', async () => {
      const token = lastLink('account-verification', 'cara@test.dev');
      await a().post('/api/auth/verify-email').send({ token }).expect(200);
      await a().post('/api/auth/verify-email').send({ token }).expect(401);
      expect((await c.get('/api/auth/me')).body.data.user.emailVerified).toBe(true);
    });

    it('cannot reach admin or recruiter-only routes', async () => {
      await c.get('/api/recruiters').expect(403);
      await c.get('/api/probe/recruiter-only').expect(403);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const login = await a().post('/api/auth/login').send({ email: 'cara@test.dev', password: PW }).expect(200);
      const oldRefresh = (login.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('refresh_token='))!.split(';')[0];

      const r1 = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', oldRefresh).expect(200);
      const newRefresh = (r1.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('refresh_token='))!.split(';')[0];
      expect(newRefresh).not.toEqual(oldRefresh);

      await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', oldRefresh).expect(401); // replay
      await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', newRefresh).expect(401); // family revoked
    });

    it('logout revokes the session', async () => {
      const s = a();
      await s.post('/api/auth/login').send({ email: 'cara@test.dev', password: PW }).expect(200);
      await s.post('/api/auth/logout').expect(200);
      await s.post('/api/auth/refresh').expect(401);
    });
  });

  describe('login hardening', () => {
    it('gives one generic error for wrong password and unknown email', async () => {
      const bad = await agent().post('/api/auth/login').send({ email: 'cara@test.dev', password: 'WrongPass1' }).expect(401);
      const none = await agent().post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'WrongPass1' }).expect(401);
      expect(bad.body.error.message).toBe(none.body.error.message);
    });

    it('is not vulnerable to operator injection', async () => {
      await agent().post('/api/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } }).expect(400);
    });
  });

  describe('password reset', () => {
    it('always answers 200 and resets with a one-time token', async () => {
      await agent().post('/api/auth/forgot-password').send({ email: 'ghost@test.dev' }).expect(200);
      await agent().post('/api/auth/forgot-password').send({ email: 'cara@test.dev' }).expect(200);
      const token = lastLink('password-reset', 'cara@test.dev');
      await agent().post('/api/auth/reset-password').send({ token, password: 'BrandNew123' }).expect(200);
      await agent().post('/api/auth/reset-password').send({ token, password: 'Another123' }).expect(401);
      await agent().post('/api/auth/login').send({ email: 'cara@test.dev', password: 'BrandNew123' }).expect(200);
    });
  });

  describe('recruiters', () => {
    it('self-registered recruiter is pending and blocked from approved-only routes', async () => {
      const r = agent();
      const res = await r.post('/api/auth/register/recruiter').send({ name: 'Rex Agent', email: 'rex@agency.dev', password: PW, agencyName: 'Rex Staffing' }).expect(201);
      expect(res.body.data.user.recruiter.approvalStatus).toBe('PENDING_REVIEW');
      const blocked = await r.get('/api/probe/recruiter-only').expect(403);
      expect(blocked.body.error.code).toBe('RECRUITER_NOT_APPROVED');
    });

    it('admin lists pending recruiters, approves one, and the recruiter gains access', async () => {
      const admin = agent();
      await admin.post('/api/auth/login').send({ email: 'admin@test.dev', password: PW }).expect(200);
      const pending = await admin.get('/api/recruiters?approvalStatus=PENDING_REVIEW').expect(200);
      expect(pending.body.meta.total).toBe(1);
      const id = pending.body.data[0].id;
      expect(pending.body.data[0]).toMatchObject({ email: 'rex@agency.dev', agencyName: 'Rex Staffing' });

      await admin.post(`/api/recruiters/${id}/reject`).send({}).expect(400); // reason required
      await admin.post(`/api/recruiters/${id}/approve`).send({}).expect(200);

      const r = agent();
      await r.post('/api/auth/login').send({ email: 'rex@agency.dev', password: PW }).expect(200);
      await r.get('/api/probe/recruiter-only').expect(200);
      expect((await admin.get('/api/recruiters/counts')).body.data).toMatchObject({ APPROVED: 1 });
    });

    it('admin creates several recruiters at once; each activates through an invite link', async () => {
      const admin = agent();
      await admin.post('/api/auth/login').send({ email: 'admin@test.dev', password: PW }).expect(200);
      const res = await admin.post('/api/recruiters/bulk').send({
        recruiters: [
          { name: 'Ann One', email: 'ann@agency.dev', agencyName: 'Ann Co' },
          { name: 'Bob Two', email: 'bob@agency.dev' },
          { name: 'Dup', email: 'ann@agency.dev' },
        ],
      }).expect(201);
      expect(res.body.data).toMatchObject({ created: 2, failed: 1 });
      expect(res.body.data.results[2]).toMatchObject({ ok: false });

      // Cannot log in before accepting the invite (no password yet).
      await agent().post('/api/auth/login').send({ email: 'ann@agency.dev', password: PW }).expect(401);

      const token = lastLink('recruiter-invite', 'ann@agency.dev');
      await agent().post('/api/auth/reset-password').send({ token, password: PW }).expect(200);
      const ann = agent();
      const login = await ann.post('/api/auth/login').send({ email: 'ann@agency.dev', password: PW }).expect(200);
      expect(login.body.data.user.recruiter.approvalStatus).toBe('APPROVED');
      await ann.get('/api/probe/recruiter-only').expect(200);
    });

    it('suspending a recruiter locks them out immediately', async () => {
      const admin = agent();
      await admin.post('/api/auth/login').send({ email: 'admin@test.dev', password: PW }).expect(200);
      const list = await admin.get('/api/recruiters?search=ann').expect(200);
      const id = list.body.data[0].id;
      const ann = agent();
      await ann.post('/api/auth/login').send({ email: 'ann@agency.dev', password: PW }).expect(200);
      await admin.post(`/api/recruiters/${id}/suspend`).expect(200);
      await ann.get('/api/auth/me').expect(401);
      await agent().post('/api/auth/login').send({ email: 'ann@agency.dev', password: PW }).expect(401);
    });
  });

  describe('google', () => {
    it('reports disabled and refuses when no client id is configured', async () => {
      const p = await request(app.getHttpServer()).get('/api/auth/providers').expect(200);
      expect(p.body.data.google.enabled).toBe(false);
      await agent().post('/api/auth/google').send({ credential: 'x'.repeat(30) }).expect(503);
    });
  });
});
