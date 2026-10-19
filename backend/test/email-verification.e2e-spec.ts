import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Connection } from 'mongoose';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/common/mail/mail.service';

const PW = 'Sup3rSecret!';

describe('Email verification (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  const sent: { to: string; template: string; vars: Record<string, string> }[] = [];
  const tokenFor = (to: string) => new URL([...sent].reverse().find((s) => s.template === 'account-verification' && s.to === to)!.vars.link).searchParams.get('token')!;

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; // read when the app starts
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: any) => { sent.push(m); } })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
  });

  afterAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('registering sends a link and gives no session until it is used', async () => {
    const r = await request(app.getHttpServer()).post('/api/auth/register/candidate').send({ name: 'Cara', email: 'cara@v.dev', password: PW }).expect(201);
    expect(r.body.data).toMatchObject({ verificationRequired: true, email: 'cara@v.dev', user: null });
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(sent.some((s) => s.to === 'cara@v.dev' && s.template === 'account-verification')).toBe(true);
  });

  it('refuses password sign-in until verified, and re-sends the link', async () => {
    const before = sent.length;
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'cara@v.dev', password: PW }).expect(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(sent.length).toBe(before + 1);
    // a wrong password still looks like any other wrong password
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'cara@v.dev', password: 'WrongPass1' }).expect(401);
  });

  it('can re-send publicly without revealing whether the email exists', async () => {
    const before = sent.length;
    await request(app.getHttpServer()).post('/api/auth/resend-verification-email').send({ email: 'ghost@v.dev' }).expect(200);
    expect(sent.length).toBe(before);
    await request(app.getHttpServer()).post('/api/auth/resend-verification-email').send({ email: 'cara@v.dev' }).expect(200);
    expect(sent.length).toBe(before + 1);
  });

  it('signs in once the emailed link has been used', async () => {
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: tokenFor('cara@v.dev') }).expect(200);
    const a = request.agent(app.getHttpServer());
    const r = await a.post('/api/auth/login').send({ email: 'cara@v.dev', password: PW }).expect(200);
    expect(r.body.data.user).toMatchObject({ email: 'cara@v.dev', emailVerified: true });
    await a.get('/api/auth/me').expect(200);
  });

  it('applies to recruiters too, and Google sign-in reports itself as unconfigured here', async () => {
    const r = await request(app.getHttpServer()).post('/api/auth/register/recruiter').send({ name: 'Rex', email: 'rex@v.dev', password: PW }).expect(201);
    expect(r.body.data.verificationRequired).toBe(true);
    expect((await request(app.getHttpServer()).get('/api/auth/providers').expect(200)).body.data.google.enabled).toBe(false);
  });
});
