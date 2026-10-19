import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/common/mail/mail.service';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';

describe('Dashboards (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  const as = async (email: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/login').send({ email, password: PW }).expect(200);
    return a;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async () => undefined }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(UsersService).create({ email: 'admin@test.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    const http = request(app.getHttpServer());
    await http.post('/api/auth/register/recruiter').send({ name: 'Rex Agent', email: 'rex@a.dev', password: PW, agencyName: 'Rex Co' }).expect(201);
    await http.post('/api/auth/register/recruiter').send({ name: 'Ron Agent', email: 'ron@a.dev', password: PW }).expect(201);
    await http.post('/api/auth/register/candidate').send({ name: 'Cara', email: 'cara@a.dev', password: PW }).expect(201);
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('admin overview reflects pending work, totals, a dense signup series and the oldest-first queue', async () => {
    const admin = await as('admin@test.dev');
    const { body } = await admin.get('/api/analytics/admin/overview').expect(200);
    const d = body.data;
    expect(d.attention).toMatchObject({ pendingRecruiters: 2, pendingCompanies: 0, pendingTotal: 2 });
    expect(d.totals).toMatchObject({ activeRecruiters: 0, activeCandidates: 1 });
    expect(d.signups).toHaveLength(30);
    const today = d.signups.at(-1);
    expect(today).toMatchObject({ candidates: 1, recruiters: 2 });
    expect(d.queue.map((q: any) => q.title)).toEqual(['Rex Agent', 'Ron Agent']);
    expect(d.queue[0]).toMatchObject({ type: 'RECRUITER', subtitle: 'Rex Co' });
    expect(d.recentActivity.length).toBeGreaterThan(0);

    const id = d.queue[0].id;
    await admin.post(`/api/recruiters/${id}/approve`).send({}).expect(200);
    const after = (await admin.get('/api/analytics/admin/overview')).body.data;
    expect(after.attention.pendingRecruiters).toBe(1);
    expect(after.totals.activeRecruiters).toBe(1);
  });

  it('each overview is limited to its role', async () => {
    const cand = await as('cara@a.dev');
    const rec = await as('rex@a.dev');
    await cand.get('/api/analytics/admin/overview').expect(403);
    await rec.get('/api/analytics/admin/overview').expect(403);
    await cand.get('/api/analytics/recruiter/overview').expect(403);
    await rec.get('/api/analytics/candidate/overview').expect(403);
    await request(app.getHttpServer()).get('/api/analytics/admin/overview').expect(401);
  });

  it('recruiter overview shows own approval and companies', async () => {
    const rec = await as('rex@a.dev');
    const { body } = await rec.get('/api/analytics/recruiter/overview').expect(200);
    expect(body.data.approval.status).toBe('APPROVED');
    expect(body.data.companies).toEqual([]);
  });

  it('candidate overview computes profile completeness server-side', async () => {
    const cand = await as('cara@a.dev');
    const { body } = await cand.get('/api/analytics/candidate/overview').expect(200);
    expect(body.data.profile.percent).toBe(0);
    expect(body.data.profile.missing).toContain('Add a headline');
    expect(body.data.emailVerified).toBe(false);
  });
});
