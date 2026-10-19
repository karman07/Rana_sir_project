import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { adminScreen } from './helpers/pipeline';
import { configureApp } from './../src/app.setup';
import { EmailTemplatesService } from './../src/communication/email-templates.service';
import { Payment } from './../src/payments/schemas/payment.schema';
import { Salary } from './../src/salary/schemas/salary.schema';
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



describe('Salary & delays (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let salaryM: Model<Salary>, emails: Model<Email>;
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
  const activate = async (key: string, over: Record<string, unknown> = {}) => {
    const r = await rex.post('/api/contracts').send({ applicationId: ids[key], ...terms({ salaryAmount: 10_000_000, salaryPeriod: 'MONTH', startDate: day(-100), ...over }) }).expect(201);
    const id = r.body.data.id;
    await rex.post(`/api/contracts/${id}/submit`).expect(200);
    await admin.post(`/api/contracts/${id}/approve`).send({}).expect(200);
    await cand[key].post(`/api/contracts/${id}/approve`).send({}).expect(200);
    return id as string;
  };
  const notes = async (a: typeof admin) => (await a.get('/api/notifications?limit=100')).body.data;
  const salaries = async (a: typeof admin, q = '') => (await a.get(`/api/salaries?limit=50&sort=period${q}`).expect(200)).body.data;
  const byPeriod = (list: any[], p: string) => list.find((s) => s.period === p);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    salaryM = moduleRef.get(getModelToken(Salary.name)); emails = moduleRef.get(getModelToken(Email.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
    await selected('cara', 'Cara Candidate');
    await selected('dan', 'Dan Candidate');
    ids.cCara = await activate('cara');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('generation', () => {
    it('appears when a contract becomes active: past months pending, this and next month upcoming', async () => {
      const list = await salaries(admin);
      expect(list.map((s: any) => s.period)).toEqual([period(3), period(2), period(1), period(0), period(-1)]);
      expect(list.map((s: any) => s.status)).toEqual(['PENDING', 'PENDING', 'PENDING', 'UPCOMING', 'UPCOMING']);
      expect(list[0]).toMatchObject({ salaryNumber: 'SAL-0001', amount: 9_000_000, grossAmount: 10_000_000, currency: 'INR' });
      expect(list[0].payDate > list[0].period).toBe(true);
    });

    it('running it again changes nothing, and numbers have no gaps', async () => {
      const r = await admin.post('/api/salaries/generate').expect(200);
      expect(r.body.data.created).toBe(0);
      expect((await salaryM.find().sort({ salaryNumber: 1 }).lean()).map((s) => s.salaryNumber)).toEqual(['SAL-0001', 'SAL-0002', 'SAL-0003', 'SAL-0004', 'SAL-0005']);
      await rex.post('/api/salaries/generate').expect(403);
    });

    it('shows each role only its own view', async () => {
      const mine = await salaries(cand.cara);
      expect(mine).toHaveLength(5);
      expect(mine[0]).toMatchObject({ amount: 9_000_000, status: 'PENDING' });
      expect(JSON.stringify(mine)).not.toMatch(/gross|commission|10000000|recruiter|rule/i);
      const rec = await salaries(rex);
      expect(rec[0].grossAmount).toBe(10_000_000);
      expect(rec[0].amount).toBeUndefined();
      expect(JSON.stringify(rec)).not.toMatch(/commission|9000000/);
      expect(await salaries(ron)).toEqual([]);
      expect(await salaries(cand.dan)).toEqual([]);
      await ron.get(`/api/salaries/${mine[0].id}`).expect(404);
      await cand.dan.get(`/api/salaries/${mine[0].id}`).expect(404);
    });
  });

  describe('following payments', () => {
    it('moves from pending to processing to paid as the money moves', async () => {
      ids.pay = (await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(201)).body.data.id;
      const get = async () => byPeriod(await salaries(admin), period(1));
      expect(await get()).toMatchObject({ status: 'PENDING', paymentId: ids.pay, payment: { status: 'AWAITING_CLIENT' } });
      await rex.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR1' }).expect(200);
      expect((await get()).status).toBe('PROCESSING'); // the company says it paid: the money is on its way
      await admin.post(`/api/payments/${ids.pay}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
      expect((await get()).status).toBe('PROCESSING');
      const c = byPeriod(await salaries(cand.cara), period(1));
      expect(c).toMatchObject({ status: 'PROCESSING', paymentId: ids.pay });
      await admin.post(`/api/payments/${ids.pay}/payout/send`).send({ method: 'UPI', reference: 'UPI-9' }).expect(200);
      expect(await get()).toMatchObject({ status: 'PAID' });
      expect(byPeriod(await salaries(cand.cara), period(1))).toMatchObject({ status: 'PAID', confirmed: false, method: 'UPI', actions: ['confirm-payment'] });
      await cand.cara.post(`/api/payments/${ids.pay}/payout/confirm`).expect(200);
      expect(byPeriod(await salaries(cand.cara), period(1))).toMatchObject({ status: 'PAID', confirmed: true, actions: [] });
    });

    it('a disputed payout shows as disputed', async () => {
      const p = (await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(3) }).expect(201)).body.data.id;
      await rex.post(`/api/payments/${p}/client/mark-paid`).send({ method: 'UPI', reference: 'U3' }).expect(200);
      await admin.post(`/api/payments/${p}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
      await admin.post(`/api/payments/${p}/payout/send`).send({ method: 'UPI', reference: 'P3' }).expect(200);
      await cand.cara.post(`/api/payments/${p}/payout/dispute`).send({ note: 'Not received' }).expect(200);
      expect(byPeriod(await salaries(admin), period(3)).status).toBe('DISPUTED');
      await admin.post(`/api/payments/${p}/payout/resolve`).send({ note: 'Sorted by phone' }).expect(200);
      expect(byPeriod(await salaries(admin), period(3)).status).toBe('PAID');
    });
  });

  describe('salary delays', () => {
    const open = async () => byPeriod(await salaries(admin), period(2));

    it('only the owning recruiter or Admin can report one, with a real reason and a future date', async () => {
      const s = await open();
      await ron.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending', newPayDate: day(10) }).expect(404);
      await cand.cara.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending', newPayDate: day(10) }).expect(403);
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'no', newPayDate: day(10) }).expect(400);
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending', newPayDate: day(-1) }).expect(400);
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending', newPayDate: s.payDate }).expect(400); // not later than now
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending', newPayDate: '10/11/2026' }).expect(400);
    });

    it('a recruiter\'s report waits for Admin, and the candidate hears nothing yet', async () => {
      const s = await open();
      const r = await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending at the company', newPayDate: day(10) }).expect(200);
      expect(r.body.data.delay).toMatchObject({ status: 'REPORTED', newPayDate: day(10) });
      expect(r.body.data.status).toBe('PENDING');
      expect(r.body.data.actions).toEqual([]); // it is with Admin now
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Budget approval pending at the company', newPayDate: day(12) }).expect(409);
      const c = byPeriod(await salaries(cand.cara), period(2));
      expect(c.status).toBe('PENDING');
      expect(c.delay).toBeUndefined();
      expect((await notes(cand.cara)).some((n: any) => /delayed/i.test(n.title))).toBe(false);
      expect((await notes(admin)).some((n: any) => n.title.startsWith('Salary delay reported'))).toBe(true);
      const summary = (await admin.get('/api/approvals/summary')).body.data;
      expect(summary.byCategory.SALARY_DELAY).toBe(1);
    });

    it('Admin can decline it with a note; the recruiter is told and the candidate still hears nothing', async () => {
      const s = await open();
      await rex.post(`/api/salaries/${s.id}/delay/reject`).send({ note: 'x' }).expect(403);
      await admin.post(`/api/salaries/${s.id}/delay/reject`).send({}).expect(400);
      await admin.post(`/api/approvals/SALARY_DELAY/${s.id}/reject`).send({ note: 'Please pay on time, the contract is clear' }).expect(200);
      const after = (await admin.get(`/api/salaries/${s.id}`)).body.data;
      expect(after.delay).toMatchObject({ status: 'REJECTED', decisionNote: 'Please pay on time, the contract is clear' });
      expect(after.delayLog.map((l: any) => l.status)).toEqual(['REPORTED', 'REJECTED']);
      expect((await notes(rex)).some((n: any) => n.title.startsWith('Salary delay not published'))).toBe(true);
      expect(byPeriod(await salaries(cand.cara), period(2)).delay).toBeUndefined();
      await admin.post(`/api/salaries/${s.id}/delay/publish`).send({}).expect(409); // nothing waiting
    });

    it('approving a revised report publishes the reason and new date to the candidate, by notification and email', async () => {
      const s = await open();
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Client funds arrive after the audit closes', newPayDate: day(14) }).expect(200);
      await admin.post(`/api/approvals/SALARY_DELAY/${s.id}/approve`).send({ note: 'Agreed' }).expect(200);
      const after = (await admin.get(`/api/salaries/${s.id}`)).body.data;
      expect(after).toMatchObject({ status: 'DELAYED', payDate: day(14), originalPayDate: s.originalPayDate, delay: { status: 'PUBLISHED' } });
      const c = byPeriod(await salaries(cand.cara), period(2));
      expect(c).toMatchObject({ status: 'DELAYED', payDate: day(14), delay: { reason: 'Client funds arrive after the audit closes', newPayDate: day(14), resolved: false } });
      expect(JSON.stringify(c)).not.toMatch(/recruiter|rex|REPORTED|decisionNote|Agreed/i);
      const n = (await notes(cand.cara)).find((x: any) => /Your .* pay is delayed/.test(x.title));
      expect(n).toBeTruthy();
      expect(n.link).toBe(`/candidate/salary/${s.id}`);
      const mail = await emails.findOne({ to: 'cara@t.dev', subject: new RegExp(`Update on your salary for ${period(2)}`) }).lean();
      expect(mail).toBeTruthy();
      expect((await notes(rex)).some((x: any) => x.title.startsWith('Salary delay published'))).toBe(true);
      const log = (await admin.get(`/api/audit-logs?entityType=Salary&entityId=${s.id}&limit=50`)).body.data.map((l: any) => l.action);
      for (const a of ['SALARY_DELAY_REPORTED', 'SALARY_DELAY_REJECTED', 'SALARY_DELAYED']) expect(log).toContain(a);
    });

    it('is settled when the salary is finally paid', async () => {
      const s = await open();
      const p = (await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(2) }).expect(201)).body.data.id;
      await rex.post(`/api/payments/${p}/client/mark-paid`).send({ method: 'UPI', reference: 'U2' }).expect(200);
      await admin.post(`/api/payments/${p}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
      expect((await admin.get(`/api/salaries/${s.id}`)).body.data.status).toBe('DELAYED'); // money is in, payout still late
      await admin.post(`/api/payments/${p}/payout/send`).send({ method: 'UPI', reference: 'P2' }).expect(200);
      expect((await admin.get(`/api/salaries/${s.id}`)).body.data).toMatchObject({ status: 'PAID', delay: { status: 'RESOLVED' } });
      expect(byPeriod(await salaries(cand.cara), period(2)).delay).toMatchObject({ resolved: true });
      await rex.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Another delay please', newPayDate: day(30) }).expect(409); // already paid
    });

    it('Admin can announce a delay directly, with no waiting', async () => {
      const s = byPeriod(await salaries(admin), period(0));
      const r = await admin.post(`/api/salaries/${s.id}/delay`).send({ reason: 'Bank holiday week at our payment partner', newPayDate: day(45) }).expect(200);
      expect(r.body.data).toMatchObject({ status: 'DELAYED', payDate: day(45), delay: { status: 'PUBLISHED' } });
      expect(byPeriod(await salaries(cand.cara), period(0))).toMatchObject({ status: 'DELAYED', delay: { reason: 'Bank holiday week at our payment partner' } });
    });
  });

  describe('contract changes', () => {
    it('recalculate what is still unpaid, and never touch what has a payment', async () => {
      const paid = byPeriod(await salaries(admin), period(1));
      await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 12_000_000, reason: 'Raise' }).expect(201);
      const after = await salaries(admin);
      expect(byPeriod(after, period(1))).toMatchObject({ amount: paid.amount, grossAmount: paid.grossAmount, contractVersion: paid.contractVersion }); // billed: untouched
      expect(byPeriod(after, period(-1))).toMatchObject({ amount: 10_800_000, grossAmount: 12_000_000, contractVersion: 2 }); // not yet billed: recalculated
      expect(byPeriod(await salaries(cand.cara), period(-1)).amount).toBe(10_800_000);
    });

    it('ending a contract drops the salaries that will never be paid', async () => {
      await admin.post(`/api/contracts/${ids.cCara}/terminate`).send({ reason: 'Project cancelled' }).expect(200);
      const periods = (await salaries(admin)).map((s: any) => s.period);
      expect(periods).not.toContain(period(-1));
      expect(periods).toContain(period(1));
    });
  });

  describe('hourly contracts', () => {
    it('take the hours from the recruiter, and billing uses them', async () => {
      ids.cDan = await activate('dan', { salaryPeriod: 'HOUR', salaryAmount: 50_000, hoursPerWeek: 20 });
      const list = await salaries(rex, `&contractId=${ids.cDan}`);
      const s = byPeriod(list, period(1));
      expect(s).toMatchObject({ hourly: true, actions: expect.arrayContaining(['submit-hours']) });
      await ron.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: 80 }).expect(404);
      await cand.dan.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: 80 }).expect(403);
      await rex.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: -1 }).expect(400);
      const r = await rex.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: 80 }).expect(200);
      expect(r.body.data).toMatchObject({ hoursWorked: 80, grossAmount: 4_000_000 });
      expect((await admin.get(`/api/salaries/${s.id}`)).body.data).toMatchObject({ amount: 3_600_000, hoursWorked: 80 });
      expect((await notes(admin)).some((n: any) => n.title.startsWith('Hours submitted'))).toBe(true);
      const pay = (await admin.post('/api/payments/generate').send({ contractId: ids.cDan, period: period(1) }).expect(201)).body.data;
      expect([pay.gross, pay.hoursWorked, pay.candidateAmount]).toEqual([4_000_000, 80, 3_600_000]); // billed from the submitted hours
      await rex.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: 90 }).expect(409); // already billed
    });

    it('are refused for a monthly contract', async () => {
      const s = (await salaries(rex, `&contractId=${ids.cCara}`))[0];
      const r = await rex.post(`/api/salaries/${s.id}/hours`).send({ hoursWorked: 10 }).expect(400);
      expect(r.body.error.code).toBe('NOT_HOURLY');
    });
  });
});
