import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import { Types, type Connection, type Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { adminScreen } from './helpers/pipeline';
import { configureApp } from './../src/app.setup';
import { EmailTemplatesService } from './../src/communication/email-templates.service';
import { Payment } from './../src/payments/schemas/payment.schema';
import { DocumentFile } from './../src/documents/schemas/document.schema';
import { Email } from './../src/communication/schemas/email.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = {
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 3,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] }, compensation: { salaryMin: 50000000, salaryMax: 90000000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const period = (monthsBack: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - monthsBack); return d.toISOString().slice(0, 7); };
const terms = (over: Record<string, unknown> = {}) => ({ title: 'Backend Engineer', employmentType: 'FULL_TIME', salaryAmount: 70_000_000, currency: 'INR', salaryPeriod: 'YEAR', startDate: day(30), probationMonths: 3, noticePeriodDays: 60, ...over });






describe('Platform admin: settings, profiles & search (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const selected = async (key: string, name: string) => {
    await reg('candidate', name, `${key}@t.dev`);
    cand[key] = await login(`${key}@t.dev`);
    await cand[key].post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
    ids[key] = (await cand[key].post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
    await adminScreen(admin, conn, ids[key]);
    await admin.patch(`/api/applications/${ids[key]}/status`).send({ status: 'SENT_TO_RECRUITER' }).expect(200);
    await rex.post(`/api/applications/${ids[key]}/recruiter-approve`).send({}).expect(200);
    for (const s of ['INTERVIEW', 'SELECTED']) await admin.patch(`/api/applications/${ids[key]}/status`).send({ status: s }).expect(200);
  };
  const activate = async (key: string) => {
    const r = await rex.post('/api/contracts').send({ applicationId: ids[key], ...terms({ salaryAmount: 10_000_000, salaryPeriod: 'MONTH', startDate: day(-100) }) }).expect(201);
    await rex.post(`/api/contracts/${r.body.data.id}/submit`).expect(200);
    await admin.post(`/api/contracts/${r.body.data.id}/approve`).send({}).expect(200);
    await cand[key].post(`/api/contracts/${r.body.data.id}/approve`).send({}).expect(200);
    return r.body.data.id as string;
  };
  const find = async (a: typeof admin, q: string) => (await a.get(`/api/search?q=${encodeURIComponent(q)}`).expect(200)).body.data as { query: string; groups: { type: string; items: any[] }[] };
  const types = (r: { groups: { type: string }[] }) => r.groups.map((g) => g.type).sort();
  const big = (mb: number) => Buffer.concat([PDF, Buffer.alloc(mb * 1024 * 1024, 32)]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); ids[e] = r.body.data.user.id; await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme Robotics' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
    ids.jobReq = jr;
    await selected('cara', 'Cara Candidate');
    await selected('dan', 'Dan Candidate');
    ids.cCara = await activate('cara');
    // Ron has a job of his own that is not yet published
    ids.companyRon = (await ron.post('/api/companies').send({ name: 'Ron Holdings' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.companyRon}/approve`).send({}).expect(200);
    const jr2 = (await ron.post('/api/job-requests').send({ companyId: ids.companyRon, spec: { ...spec, title: 'Secret Draft Role' } }).expect(201)).body.data.id;
    ids.jobReqRon = jr2;
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('platform settings', () => {
    it('start from sensible defaults, Admin-only, with a safe subset for everyone', async () => {
      await rex.get('/api/settings').expect(403);
      await cand.cara.patch('/api/settings').send({ payments: { dueGraceDays: 1 } }).expect(403);
      await request(app.getHttpServer()).get('/api/settings').expect(401);
      expect((await admin.get('/api/settings').expect(200)).body.data).toEqual({
        company: { name: 'Talentbridge', legalName: '', supportEmail: '', supportPhone: '', address: '', website: '' }, defaults: { currency: 'USD' }, payments: { dueGraceDays: 5, salaryPayLagDays: 7 }, documents: { maxUploadMb: 5 },
      });
      const d = (await cand.cara.get('/api/settings/defaults').expect(200)).body.data;
      expect(d).toEqual({ companyName: 'Talentbridge', currency: 'USD', maxUploadMb: 5 });
    });

    it('validate what is saved', async () => {
      await admin.patch('/api/settings').send({ defaults: { currency: 'XXX' } }).expect(400);
      await admin.patch('/api/settings').send({ payments: { dueGraceDays: 100 } }).expect(400);
      await admin.patch('/api/settings').send({ payments: { dueGraceDays: -1 } }).expect(400);
      await admin.patch('/api/settings').send({ documents: { maxUploadMb: 0 } }).expect(400);
      await admin.patch('/api/settings').send({ company: { supportEmail: 'not-an-email' } }).expect(400);
      await admin.patch('/api/settings').send({ company: { website: 'example.com' } }).expect(400);
      await admin.patch('/api/settings').send({ company: { name: 'x' } }).expect(400);
      await admin.patch('/api/settings').send({ mystery: true }).expect(400);
    });

    it('merge a partial change, keep the rest, and audit before and after', async () => {
      const r = await admin.patch('/api/settings').send({ company: { name: 'Northwind Staffing', supportEmail: 'help@northwind.test' }, defaults: { currency: 'INR' } }).expect(200);
      expect(r.body.data.company).toMatchObject({ name: 'Northwind Staffing', supportEmail: 'help@northwind.test', legalName: '' });
      expect(r.body.data.defaults.currency).toBe('INR');
      expect(r.body.data.payments).toEqual({ dueGraceDays: 5, salaryPayLagDays: 7 });
      expect((await cand.cara.get('/api/settings/defaults')).body.data).toMatchObject({ companyName: 'Northwind Staffing', currency: 'INR', supportEmail: 'help@northwind.test' });
      await admin.patch('/api/settings').send({ defaults: { currency: 'INR' } }).expect(200); // unchanged: nothing recorded
      const log = (await admin.get('/api/audit-logs?entityType=PlatformSettings&limit=20')).body.data;
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ action: 'SETTINGS_UPDATED', actorName: 'Admin' });
    });

    it('actually change how payments and salary are dated for what comes next', async () => {
      await admin.patch('/api/settings').send({ payments: { dueGraceDays: 12, salaryPayLagDays: 3 } }).expect(200);
      const pay = (await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(201)).body.data;
      const [y, m] = period(1).split('-').map(Number);
      const monthEnd = new Date(Date.UTC(y, m, 0));
      expect(pay.dueDate).toBe(new Date(monthEnd.getTime() + 12 * 86_400_000).toISOString().slice(0, 10));
      const oldSal = (await admin.get(`/api/salaries?limit=20&contractId=${ids.cCara}`)).body.data[0];
      expect(new Date(`${oldSal.payDate}T00:00:00Z`).getTime() - new Date(monthEndOf(oldSal.period)).getTime()).toBe(7 * 86_400_000); // already generated: left alone
      ids.cDan = await activate('dan');
      const sal = (await admin.get(`/api/salaries?limit=20&contractId=${ids.cDan}`)).body.data.find((s: any) => s.period === period(1));
      expect(new Date(`${sal.payDate}T00:00:00Z`).getTime() - new Date(monthEndOf(sal.period)).getTime()).toBe(3 * 86_400_000); // new ones use the new lag
      await admin.patch('/api/settings').send({ payments: { dueGraceDays: 5, salaryPayLagDays: 7 } }).expect(200);
    });

    it('apply the upload size limit and clean up what was refused', async () => {
      await admin.patch('/api/settings').send({ documents: { maxUploadMb: 1 } }).expect(200);
      const docs = moduleDocs();
      const before = await docs.countDocuments({});
      const tooBig = await cand.dan.post('/api/documents').field('type', 'OTHER').attach('file', big(2), { filename: 'huge.pdf', contentType: 'application/pdf' }).expect(413);
      expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');
      expect(tooBig.body.error.message).toBe('Files can be up to 1 MB');
      expect(await docs.countDocuments({})).toBe(before);
      await cand.dan.post('/api/documents').field('type', 'OTHER').attach('file', PDF, { filename: 'small.pdf', contentType: 'application/pdf' }).expect(201);
      await admin.patch('/api/settings').send({ documents: { maxUploadMb: 5 } }).expect(200);
      await cand.dan.post('/api/documents').field('type', 'OTHER').attach('file', big(2), { filename: 'now-fine.pdf', contentType: 'application/pdf' }).expect(201);
      await cand.dan.post('/api/documents').field('type', 'OTHER').attach('file', big(6), { filename: 'too-big.pdf', contentType: 'application/pdf' }).expect(413);
    });

    it('show who can do what, to Admin only', async () => {
      await rex.get('/api/settings/permissions').expect(403);
      const g = (await admin.get('/api/settings/permissions').expect(200)).body.data.groups;
      expect(g.map((x: any) => x.area)).toEqual(['Accounts', 'Companies & jobs', 'Candidates & applications', 'Contracts', 'Money', 'Documents & data', 'Platform']);
      for (const row of g.flatMap((x: any) => x.rows)) for (const r of ['admin', 'recruiter', 'candidate']) expect(['yes', 'own', 'approved', 'none']).toContain(row[r]);
      const commission = g.flatMap((x: any) => x.rows).find((r: any) => /commission and the platform/.test(r.capability));
      expect(commission).toMatchObject({ admin: 'yes', recruiter: 'none', candidate: 'none' });
    });
  });

  const monthEndOf = (p: string) => { const [y, m] = p.split('-').map(Number); return Date.UTC(y, m, 0); };
  function moduleDocs() { return conn.model<any>('DocumentFile'); }

  describe('profile pages', () => {
    it('give Admin the whole picture of a recruiter', async () => {
      await rex.get(`/api/directory/recruiters/${ids['rex@t.dev']}`).expect(403);
      await cand.cara.get(`/api/directory/recruiters/${ids['rex@t.dev']}`).expect(403);
      await admin.get('/api/directory/recruiters/65f000000000000000000001').expect(404);
      await admin.get(`/api/directory/recruiters/${ids.company}`).expect(404); // an id that is not a recruiter's
      const r = (await admin.get(`/api/directory/recruiters/${ids['rex@t.dev']}`).expect(200)).body.data;
      expect(r.user).toMatchObject({ name: 'Rex Agent', email: 'rex@t.dev', status: 'ACTIVE' });
      expect(r.profile.approvalStatus).toBe('APPROVED');
      expect(r.stats).toMatchObject({ totalJobs: 1, liveJobs: 1, candidatesSent: 2, selected: 2, activeContracts: 2 }); // Cara's contract, and Dan's from the settings test
      expect(r.companies).toEqual([expect.objectContaining({ name: 'Acme Robotics', linkStatus: 'APPROVED' })]);
      expect(r.jobs[0]).toMatchObject({ jobNumber: expect.stringMatching(/^JOB-/), applications: 2 });
      expect(r.money).toEqual([{ currency: 'INR', billed: 10_000_000, commission: 0 }]);
    });

    it('give Admin the whole picture of a company', async () => {
      await rex.get(`/api/directory/companies/${ids.company}`).expect(403);
      await admin.get('/api/directory/companies/65f000000000000000000001').expect(404);
      const c = (await admin.get(`/api/directory/companies/${ids.company}`).expect(200)).body.data;
      expect(c.company).toMatchObject({ name: 'Acme Robotics', approvalStatus: 'APPROVED' });
      expect(c.stats).toMatchObject({ jobs: 1, liveJobs: 1, applications: 2, selected: 2, activeContracts: 2, contracts: 2 });
      expect(c.recruiters).toEqual([expect.objectContaining({ name: 'Rex Agent', linkStatus: 'APPROVED' })]);
      expect(c.money).toEqual([{ currency: 'INR', billed: 10_000_000, outstanding: 10_000_000 }]);
    });
  });

  describe('global search', () => {
    it('needs a real query, and a sign-in', async () => {
      await request(app.getHttpServer()).get('/api/search?q=acme').expect(401);
      expect(await find(admin, '')).toEqual({ query: '', groups: [] });
      expect(await find(admin, 'a')).toEqual({ query: 'a', groups: [] });
    });

    it('lets Admin find a person, a company, a job or a number', async () => {
      expect(types(await find(admin, 'rex'))).toEqual(['recruiter']);
      const r = await find(admin, 'Rex');
      expect(r.groups[0].items[0]).toMatchObject({ title: 'Rex Agent', href: `/admin/recruiters/${ids['rex@t.dev']}` });
      expect((await find(admin, 'Acme')).groups.find((g) => g.type === 'company')!.items[0]).toMatchObject({ title: 'Acme Robotics', href: `/admin/companies/${ids.company}` });
      expect(types(await find(admin, 'cara@t'))).toEqual(['candidate']);
      expect((await find(admin, 'JOB-')).groups.find((g) => g.type === 'job')!.items.length).toBe(1); // one published job; Ron's request has no JOB- number yet
      expect((await find(admin, 'JR-')).groups.find((g) => g.type === 'job')!.items.length).toBe(2);
      expect((await find(admin, 'Backend')).groups.find((g) => g.type === 'job')!.items[0].href).toBe(`/admin/job-requests/${ids.jobReq}`);
      expect((await find(admin, 'CON-0001')).groups.find((g) => g.type === 'contract')!.items[0].href).toMatch(/^\/admin\/contracts\//);
      expect(types(await find(admin, 'APP-'))).toContain('application');
      expect(types(await find(admin, 'SAL-'))).toEqual(['salary']);
    });

    it('treats the text literally, never as a pattern', async () => {
      for (const q of ['.*', '(', '[a-z]+', '\\', 'a|b', '^']) { const r = await find(admin, q); expect(r.groups).toEqual([]); }
      expect(await find(admin, 'x'.repeat(250))).toMatchObject({ groups: [] });
    });

    it('shows a recruiter only their own work, and no other people or companies', async () => {
      const r = await find(rex, 'Acme');
      expect(r.groups).toEqual([]); // company names are not searchable by recruiters
      expect(types(await find(rex, 'Backend'))).toEqual(['job']);
      expect(types(await find(rex, 'Secret Draft'))).toEqual([]); // Ron's job
      expect(types(await find(ron, 'Secret Draft'))).toEqual(['job']);
      expect((await find(ron, 'Secret Draft')).groups[0].items[0].href).toBe(`/recruiter/jobs/${ids.jobReqRon}`);
      expect(types(await find(rex, 'Cara'))).toEqual([]); // candidates are found by application number, not by name
      expect(types(await find(rex, 'APP-'))).toEqual(['application']);
      expect((await find(rex, 'APP-')).groups[0].items[0].href).toMatch(/^\/recruiter\/candidates\//);
      expect(types(await find(rex, 'CON-'))).toEqual(['contract']);
      expect(types(await find(ron, 'CON-'))).toEqual([]);
      expect(types(await find(ron, 'APP-'))).toEqual([]);
      expect(types(await find(rex, 'rex'))).toEqual([]);
    });

    it('shows a candidate only their own records and published jobs', async () => {
      expect(types(await find(cand.cara, 'Backend'))).toEqual(['job']);
      expect((await find(cand.cara, 'Backend')).groups[0].items[0].href).toMatch(/^\/candidate\/jobs\//);
      expect(types(await find(cand.cara, 'Secret Draft'))).toEqual([]); // not published
      expect(types(await find(cand.cara, 'APP-'))).toEqual(['application']);
      expect((await find(cand.cara, 'APP-')).groups[0].items).toHaveLength(1);
      expect(types(await find(cand.cara, 'CON-'))).toEqual(['contract']);
      const danContracts = (await find(cand.dan, 'CON-')).groups.find((g) => g.type === 'contract')!.items;
      expect(danContracts).toHaveLength(1);
      expect(danContracts[0].title).toBe('CON-0002'); // never Cara's CON-0001
      expect(types(await find(cand.cara, 'Rex'))).toEqual([]);
      expect(types(await find(cand.cara, 'Acme'))).toEqual([]);
      expect(types(await find(cand.cara, 'dan@t'))).toEqual([]);
    });
  });
});
