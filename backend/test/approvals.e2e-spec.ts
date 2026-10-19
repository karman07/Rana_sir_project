import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/common/mail/mail.service';
import { JobRequest } from './../src/jobs/schemas/job-request.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const spec = {
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 1,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] },
  compensation: { salaryMin: 100000, salaryMax: 200000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};

describe('Approval Center (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>;
  let rex: ReturnType<typeof request.agent>;
  let requests: Model<JobRequest>;
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/login').send({ email, password: PW }).expect(200);
    return a;
  };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const summary = async () => (await admin.get('/api/approvals/summary').expect(200)).body.data;
  const list = async (qs = '') => (await admin.get(`/api/approvals?${qs}`).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue({ send: async () => undefined }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    requests = moduleRef.get(getModelToken(JobRequest.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');

    const r1 = await reg('recruiter', 'Rex Agent', 'rex@t.dev');
    ids.rex = r1.body.data.user.id;
    await admin.post(`/api/recruiters/${ids.rex}/approve`).send({}).expect(200);
    rex = await login('rex@t.dev');
    ids.ron = (await reg('recruiter', 'Ron Pending', 'ron@t.dev')).body.data.user.id; // stays pending
    await reg('candidate', 'Cara', 'cara@t.dev');

    // Rex adds a company (pending) -> admin approves -> Rex posts a job request
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme Corp', industry: 'Software' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    ids.company2 = (await rex.post('/api/companies').send({ name: 'Globex' }).expect(201)).body.data.id; // pending company
    ids.jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${ids.jr}/submit`).expect(200);
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('is admin only', async () => {
    await request(app.getHttpServer()).get('/api/approvals').expect(401);
    await rex.get('/api/approvals').expect(403);
    await rex.get('/api/approvals/summary').expect(403);
    await rex.post(`/api/approvals/JOB_REQUEST/${ids.jr}/approve`).send({}).expect(403);
  });

  it('summarises everything waiting, by category', async () => {
    const s = await summary();
    expect(s.byCategory).toMatchObject({ JOB_REQUEST: 1, RECRUITER_ACCOUNT: 1, COMPANY: 1, COMPANY_LINK: 0, RECRUITER_DECISION: 0, CANDIDATE_REQUEST: 0 });
    expect(s.total).toBe(3);
    expect(s.categories.map((c: any) => c.key)).toEqual(['JOB_REQUEST', 'JOB_CHANGE', 'RECRUITER_DECISION', 'CANDIDATE_REQUEST', 'CONTRACT_APPROVAL', 'CONTRACT_CHANGE', 'PAYMENT_CONFIRMATION', 'SALARY_DELAY', 'RECRUITER_ACCOUNT', 'COMPANY', 'COMPANY_LINK']);
  });

  it('lists items with requester, related entity and a deep link', async () => {
    const { data, meta } = await list();
    expect(meta.total).toBe(3);
    const job = data.find((i: any) => i.category === 'JOB_REQUEST');
    expect(job).toMatchObject({ id: `JOB_REQUEST:${ids.jr}`, title: 'Backend Engineer', priority: 'NORMAL', requester: { name: 'Rex Agent' }, related: { label: 'Acme Corp' }, href: `/admin/job-requests/${ids.jr}`, actions: ['approve', 'request-changes', 'reject'] });
    const rec = data.find((i: any) => i.category === 'RECRUITER_ACCOUNT');
    expect(rec).toMatchObject({ title: 'Ron Pending', entityId: ids.ron });
    const co = data.find((i: any) => i.category === 'COMPANY');
    expect(co).toMatchObject({ title: 'Globex', requester: { name: 'Rex Agent' } });
  });

  it('orders by priority then by how long each has waited, and filters', async () => {
    const old = new Date(Date.now() - 5 * 86_400_000);
    await requests.updateOne({ _id: ids.jr }, { submittedAt: old });
    const { data } = await list();
    expect(data[0]).toMatchObject({ category: 'JOB_REQUEST', priority: 'HIGH', waitingDays: 5 });

    expect((await list('priority=HIGH')).meta.total).toBe(1);
    expect((await list('category=COMPANY')).data.map((i: any) => i.title)).toEqual(['Globex']);
    expect((await list('search=ron')).data.map((i: any) => i.title)).toEqual(['Ron Pending']);
    expect((await list('search=acme')).meta.total).toBe(1); // matches related company on the job request
    await admin.get('/api/approvals?priority=URGENT').expect(400);
  });

  it('requires a reason for reject / request-changes and rejects unknown actions or categories', async () => {
    await admin.post(`/api/approvals/COMPANY/${ids.company2}/reject`).send({}).expect(400);
    await admin.post(`/api/approvals/COMPANY/${ids.company2}/request-changes`).send({ note: 'x' }).expect(400);
    await admin.post(`/api/approvals/COMPANY/${ids.company2}/delete`).send({}).expect(400);
    await admin.post(`/api/approvals/NOPE/${ids.company2}/approve`).send({}).expect(404);
    await admin.post('/api/approvals/COMPANY/not-an-id/approve').send({}).expect(400);
  });

  it('acts through the same rules as the dedicated screens (and audits them)', async () => {
    await admin.post(`/api/approvals/COMPANY/${ids.company2}/request-changes`).send({ note: 'Add a website' }).expect(200);
    expect((await summary()).byCategory.COMPANY).toBe(0);

    const approved = await admin.post(`/api/approvals/JOB_REQUEST/${ids.jr}/approve`).send({ publish: false, commission: { type: 'PERCENT', percent: 10 } }).expect(200);
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', jobNumber: 'JOB-1001' });
    await admin.post(`/api/approvals/JOB_REQUEST/${ids.jr}/approve`).send({}).expect(409); // already decided

    await admin.post(`/api/approvals/RECRUITER_ACCOUNT/${ids.ron}/reject`).send({ note: 'Not a fit' }).expect(200);
    expect((await summary()).total).toBe(0);
    expect((await list()).data).toEqual([]);

    const log = await admin.get('/api/audit-logs?limit=50').expect(200);
    const actions = log.body.data.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['COMPANY_CHANGES_REQUESTED', 'JOB_APPROVED', 'RECRUITER_ACCOUNT_REJECTED']));
  });

  it('company access requests appear once the company is approved, and can be decided', async () => {
    const ron2 = await reg('recruiter', 'Ron Second', 'ron2@t.dev');
    await admin.post(`/api/recruiters/${ron2.body.data.user.id}/approve`).send({}).expect(200);
    const ron = await login('ron2@t.dev');
    await ron.post(`/api/companies/${ids.company}/request-link`).expect(200);

    const { data } = await list('category=COMPANY_LINK');
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ title: 'Ron Second → Acme Corp', actions: ['approve', 'reject'] });
    await admin.post(`/api/approvals/COMPANY_LINK/${data[0].entityId}/request-changes`).send({ note: 'nope!!' }).expect(409);
    await admin.post(`/api/approvals/COMPANY_LINK/${data[0].entityId}/approve`).send({}).expect(200);
    await admin.post(`/api/approvals/COMPANY_LINK/${data[0].entityId}/approve`).send({}).expect(409);
    expect((await ron.get('/api/companies/mine/usable')).body.data.map((c: any) => c.name)).toEqual(['Acme Corp']);
  });

  it('a resubmitted job request is flagged and escalates faster', async () => {
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec: { ...spec, title: 'Platform Engineer' } }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    await admin.post(`/api/job-requests/${jr}/request-changes`).send({ note: 'Clarify salary' }).expect(200);
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    await requests.updateOne({ _id: jr }, { submittedAt: new Date(Date.now() - 30 * 3_600_000) });
    const item = (await list('category=JOB_REQUEST')).data[0];
    expect(item).toMatchObject({ priority: 'HIGH', tags: ['Resubmitted · v2'] });
  });
});
