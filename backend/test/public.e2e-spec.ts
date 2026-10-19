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
import { EmailTemplatesService } from './../src/communication/email-templates.service';
import { Email } from './../src/communication/schemas/email.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const spec = (title: string) => ({
  title, department: 'Engineering', location: 'Pune', workMode: 'REMOTE', employmentType: 'FULL_TIME', openings: 1,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] }, compensation: { salaryMin: 100000, salaryMax: 200000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.', specialInstructions: 'INTERNAL ONLY' },
});

describe('Public website API (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let emails: Model<Email>;
  let admin: ReturnType<typeof request.agent>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit(); // the database was just wiped
    emails = moduleRef.get(getModelToken(Email.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/login').send({ email: 'admin@t.dev', password: PW }).expect(200);
    const r = await http().post('/api/auth/register/recruiter').send({ name: 'Rex', email: 'rex@t.dev', password: PW }).expect(201);
    await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200);
    const rex = request.agent(app.getHttpServer());
    await rex.post('/api/auth/login').send({ email: 'rex@t.dev', password: PW }).expect(200);
    const company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${company}/approve`).send({}).expect(200);
    const make = async (title: string, publish: boolean) => {
      const jr = (await rex.post('/api/job-requests').send({ companyId: company, spec: spec(title) }).expect(201)).body.data.id;
      await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
      return (await admin.post(`/api/job-requests/${jr}/approve`).send({ publish, commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId as string;
    };
    ids.live = await make('Live Role', true);
    ids.hidden = await make('Unpublished Role', false);
    ids.pending = (await rex.post('/api/job-requests').send({ companyId: company, spec: spec('Pending Role') }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${ids.pending}/submit`).expect(200);
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('lists only published jobs to anyone, without internal fields', async () => {
    const res = await http().get('/api/public/jobs').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ jobNumber: 'JOB-1001', company: { name: 'Acme' }, spec: { title: 'Live Role' } });
    expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL ONLY|specialInstructions|recruiterId|rex@t\.dev|"saved"/);
  });

  it('filters and searches without signing in', async () => {
    expect((await http().get('/api/public/jobs?search=live').expect(200)).body.meta.total).toBe(1);
    expect((await http().get('/api/public/jobs?search=unpublished').expect(200)).body.meta.total).toBe(0);
    expect((await http().get('/api/public/jobs?workMode=ONSITE').expect(200)).body.meta.total).toBe(0);
    expect((await http().get('/api/public/jobs?status=CLOSED').expect(200)).body.meta.total).toBe(1); // status filter ignored
    expect((await http().get('/api/public/jobs?saved=true').expect(200)).body.meta.total).toBe(1);
  });

  it('only shows published jobs by id', async () => {
    const ok = await http().get(`/api/public/jobs/${ids.live}`).expect(200);
    expect(ok.body.data.spec.details.description).toContain('hiring platform');
    expect(JSON.stringify(ok.body)).not.toContain('INTERNAL ONLY');
    await http().get(`/api/public/jobs/${ids.hidden}`).expect(404);
    await http().get(`/api/public/jobs/${ids.pending}`).expect(404);
    await http().get('/api/public/jobs/not-an-id').expect(400);
  });

  it('reports real platform numbers', async () => {
    const s = (await http().get('/api/public/stats').expect(200)).body.data;
    expect(s).toMatchObject({ openJobs: 1, companies: 1, placements: 0 });
    expect(s.departments).toEqual([{ name: 'Engineering', count: 1 }]);
  });

  it('accepts a contact message, stores it, and alerts Admin', async () => {
    await http().post('/api/public/contact').send({ name: 'Pat Hirer', email: 'PAT@Corp.com', topic: 'HIRING', company: 'Corp', message: 'We need five engineers in Pune.' }).expect(201);
    const note = (await admin.get('/api/notifications').expect(200)).body.data.find((n: any) => n.title === 'New enquiry from Pat Hirer');
    expect(note).toBeTruthy();
    const mail = await emails.findOne({ template: 'contact-received-admin' }).select('+html').lean();
    expect(mail!.html).toContain('We need five engineers in Pune.');
    expect(mail!.html).toContain('pat@corp.com');
  });

  it('validates contact input and rate-limits it', async () => {
    await http().post('/api/public/contact').send({ name: 'x', email: 'nope', message: 'short' }).expect(400);
    await http().post('/api/public/contact').send({ name: 'Pat', email: 'pat@corp.com', message: 'A valid message here', extra: 1 }).expect(400);
    let limited = 0;
    for (let i = 0; i < 8; i++) {
      const r = await http().post('/api/public/contact').send({ name: 'Spam Bot', email: 'bot@spam.test', message: 'Buy my product now please' });
      if (r.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});
