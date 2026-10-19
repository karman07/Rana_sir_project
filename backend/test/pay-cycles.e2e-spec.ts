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
import { periodOf } from './../src/common/pay-period';
import { Payment } from './../src/payments/schemas/payment.schema';
import { PaymentsService } from './../src/payments/payments.service';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const spec = (frequency: string) => ({
  title: `Gig ${frequency}`, location: 'Remote', workMode: 'REMOTE', employmentType: 'PART_TIME', openings: 5,
  requirements: { experienceMin: 1, technicalSkills: ['Writing'] },
  compensation: { salaryMin: 4_000_000, salaryMax: 6_000_000, currency: 'INR', payBasis: 'HOUR', hoursPerWeek: 20, payFrequency: frequency },
  details: { description: 'Part-time work paid on a short cycle.', responsibilities: 'Deliver the work.' },
});
const terms = (over: Record<string, unknown> = {}) => ({ title: 'Gig', employmentType: 'PART_TIME', salaryAmount: 50_000, currency: 'INR', salaryPeriod: 'HOUR', hoursPerWeek: 20, startDate: day(-60), probationMonths: 1, noticePeriodDays: 14, ...over });

describe('Daily, weekly and monthly pay; paying several people at once; candidates asking for their pay (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let paymentsM: Model<Payment>, payments: PaymentsService;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const publish = async (frequency: string) => {
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec: spec(frequency) }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    return (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 20 } }).expect(200)).body.data.jobId as string;
  };
  const hire = async (key: string, name: string, jobId: string, over: Record<string, unknown> = {}) => {
    await reg('candidate', name, `${key}@t.dev`);
    cand[key] = await login(`${key}@t.dev`);
    await cand[key].post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
    const app_ = (await cand[key].post('/api/applications').send({ jobId }).expect(201)).body.data.id;
    await adminScreen(admin, conn, app_);
    await admin.patch(`/api/applications/${app_}/status`).send({ status: 'SENT_TO_RECRUITER' }).expect(200);
    await rex.post(`/api/applications/${app_}/recruiter-approve`).send({}).expect(200);
    for (const s of ['INTERVIEW', 'SELECTED']) await admin.patch(`/api/applications/${app_}/status`).send({ status: s }).expect(200);
    const c = (await rex.post('/api/contracts').send({ applicationId: app_, ...terms(over) }).expect(201)).body.data.id;
    await rex.post(`/api/contracts/${c}/submit`).expect(200);
    await admin.post(`/api/contracts/${c}/approve`).send({}).expect(200);
    await cand[key].post(`/api/contracts/${c}/approve`).send({}).expect(200);
    ids[`c_${key}`] = c;
    return c as string;
  };
  const notes = async (a: typeof admin) => (await a.get('/api/notifications?limit=100')).body.data;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    paymentsM = moduleRef.get(getModelToken(Payment.name)); payments = moduleRef.get(PaymentsService);
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    ids.weekly = await publish('WEEKLY');
    ids.daily = await publish('DAILY');
    ids.monthly = await publish('MONTHLY');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  it('bills each job on its own cycle: weekly jobs by the week, daily jobs by the day, the rest by the month', async () => {
    await hire('wendy', 'Wendy Weekly', ids.weekly);
    await hire('dee', 'Dee Daily', ids.daily, { startDate: day(-10) });
    await hire('mo', 'Mo Monthly', ids.monthly);
    await payments.runBilling();
    const list = async (key: string) => (await admin.get(`/api/payments?contractId=${ids[`c_${key}`]}&limit=100`)).body.data.map((p: any) => p.period) as string[];
    const w = await list('wendy'), dd = await list('dee'), m = await list('mo');
    expect(w.length).toBeGreaterThanOrEqual(8);
    expect(w.every((p) => /^\d{4}-W\d{2}$/.test(p))).toBe(true);
    expect(dd.length).toBeGreaterThanOrEqual(8);
    expect(dd.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p))).toBe(true);
    expect(dd).not.toContain(day(0)); // today is not over yet
    expect(m.every((p) => /^\d{4}-\d{2}$/.test(p))).toBe(true);
    // a week of a 20-hours-a-week hourly contract: 20h x 500 = 10,000 before commission
    const week = (await admin.get(`/api/payments?contractId=${ids.c_wendy}&limit=1`)).body.data[0];
    expect([week.gross, week.commission, week.candidateAmount]).toEqual([1_000_000, 200_000, 800_000]);
    const dayPay = (await admin.get(`/api/payments?contractId=${ids.c_dee}&limit=1`)).body.data[0];
    expect(dayPay.gross).toBe(200_000); // one day = a fifth of the week
    // running it again adds nothing
    expect((await payments.runBilling()).created).toBe(0);
  });

  it('Admin can bill any period by hand, and a bad key is refused', async () => {
    const thisWeek = periodOf(day(0), 'WEEK');
    const made = await admin.post('/api/payments/generate').send({ contractId: ids.c_wendy, period: thisWeek, hoursWorked: 12 }).expect(201);
    expect(made.body.data.gross).toBe(600_000);
    await admin.post('/api/payments/generate').send({ contractId: ids.c_wendy, period: thisWeek }).expect(409);
    await admin.post('/api/payments/generate').send({ contractId: ids.c_wendy, period: '2026-W99' }).expect(400);
    await admin.post('/api/payments/generate').send({ contractId: ids.c_wendy, period: '2020-W10' }).expect(400); // before the contract
  });

  describe('the recruiter releases several payments at once', () => {
    let pay: string[] = [];
    let expected: number[] = [];
    it('records one release for many candidates, and Admin gets a single notice', async () => {
      await hire('will', 'Will Weekly', ids.weekly);
      await hire('wyn', 'Wyn Weekly', ids.weekly);
      await payments.runBilling();
      const all = async (key: string) => (await rex.get(`/api/payments?contractId=${ids[`c_${key}`]}&statuses=AWAITING_CLIENT&limit=100`)).body.data;
      const picked = [(await all('wendy'))[0], (await all('will'))[0], (await all('wyn'))[0]];
      pay = picked.map((x: any) => x.id);
      expected = [picked[0].amountDue, 900_000, picked[2].amountDue]; // the middle one is released short
      await ron.post('/api/payments/release-batch').send({ paymentIds: pay, method: 'Bank transfer', reference: 'UTR-1' }).expect(404); // not Ron's
      await cand.wendy.post('/api/payments/release-batch').send({ paymentIds: pay, method: 'x', reference: 'UTR-1' }).expect(403);
      await rex.post('/api/payments/release-batch').send({ paymentIds: [], method: 'Bank transfer', reference: 'UTR-1' }).expect(400);
      const before = (await notes(admin)).length;
      const r = (await rex.post('/api/payments/release-batch').send({ paymentIds: pay, method: 'Bank transfer', reference: 'UTR-1', amounts: [{ paymentId: pay[1], amount: 900_000 }] }).expect(200)).body.data;
      expect(r).toMatchObject({ count: 3 });
      expect(r.batchRef).toMatch(/^REL-/);
      expect(r.total[0].amount).toBe(expected.reduce((a, b) => a + b, 0));
      const rows = await Promise.all(pay.map(async (id) => (await admin.get(`/api/payments/${id}`)).body.data));
      expect(rows.map((x) => x.status)).toEqual(['CLIENT_PAID', 'CLIENT_PAID', 'CLIENT_PAID']);
      expect(rows[1].gross).toBe(900_000); // a different amount was released: the split was recalculated
      expect(rows[1].commission).toBe(180_000); // 20% of what was released
      expect(rows.every((x) => x.client.batchRef === r.batchRef && x.client.reference === 'UTR-1')).toBe(true);
      const fresh = (await notes(admin)).slice(0, (await notes(admin)).length - before);
      expect(fresh.filter((n: any) => n.title.startsWith('Payment released')).length).toBe(1);
      expect(fresh.find((n: any) => n.title.startsWith('Payment released')).title).toContain('3 payments');
      await rex.post('/api/payments/release-batch').send({ paymentIds: pay, method: 'Bank transfer', reference: 'UTR-1' }).expect(409); // already released
    });

    it('Admin confirms the whole transfer at once; a wrong total confirms nothing', async () => {
      await rex.post('/api/payments/confirm-batch').send({ paymentIds: pay, amountReceived: 1 }).expect(403);
      const short = (await admin.post('/api/payments/confirm-batch').send({ paymentIds: pay, amountReceived: 2_000_000 }).expect(200)).body.data;
      expect(short).toMatchObject({ confirmed: 0, disputed: 3 });
      const disputed = (await admin.get(`/api/payments/${pay[0]}`)).body.data;
      expect(disputed.status).toBe('DISPUTED');
      // the company releases them again, then the right total arrives
      await rex.post('/api/payments/release-batch').send({ paymentIds: pay, method: 'Bank transfer', reference: 'UTR-2', amounts: [{ paymentId: pay[1], amount: 900_000 }] }).expect(200);
      const ok = (await admin.post('/api/payments/confirm-batch').send({ paymentIds: pay, amountReceived: expected.reduce((a, b) => a + b, 0) }).expect(200)).body.data;
      expect(ok).toMatchObject({ confirmed: 3, disputed: 0 });
      const rows = await Promise.all(pay.map(async (id) => (await admin.get(`/api/payments/${id}`)).body.data));
      expect(rows.every((x) => x.status === 'RECEIVED' && x.payout.status === 'PENDING')).toBe(true);
    });

    it('Admin then forwards everyone\'s pay with one reference, and each candidate confirms', async () => {
      await rex.post('/api/payments/payout-batch').send({ paymentIds: pay, method: 'UPI', reference: 'PAYOUT-1' }).expect(403);
      const sent = (await admin.post('/api/payments/payout-batch').send({ paymentIds: pay, method: 'UPI', reference: 'PAYOUT-1' }).expect(200)).body.data;
      expect(sent.sent).toBe(3);
      expect(sent.total[0].amount).toBe(expected.reduce((a, b) => a + Math.round(b * 0.8), 0)); // what the candidates get after our 20%
      await admin.post('/api/payments/payout-batch').send({ paymentIds: pay, method: 'UPI', reference: 'PAYOUT-1' }).expect(409);
      await cand.wendy.post(`/api/payments/${pay[0]}/payout/confirm`).expect(200);
      const mine = (await cand.wendy.get(`/api/payments/${pay[0]}`)).body.data;
      expect(JSON.stringify(mine)).not.toMatch(/commission/i);
      expect(mine.candidateAmount ?? mine.amount).toBe(Math.round(expected[0] * 0.8));
    });
  });

  describe('a candidate asks for their pay from their own portal', () => {
    let reqId: string;
    it('creates (or flags) the payment and tells both the recruiter and Admin', async () => {
      await cand.mo.post('/api/payments/request').send({ period: '2026-W99' }).expect(400);
      await cand.mo.post('/api/payments/request').send({ period: periodOf(day(0), 'WEEK') }).expect(400); // Mo is paid monthly: wrong kind of period
      await rex.post('/api/payments/request').send({}).expect(403);
      const before = { rex: (await notes(rex)).length, admin: (await notes(admin)).length };
      const r = (await cand.mo.post('/api/payments/request').send({ note: 'Rent is due this week' }).expect(201)).body.data;
      reqId = r.id;
      expect(r).toMatchObject({ note: 'Rent is due this week', stage: 'Waiting for the company', canConfirm: false });
      const rexNotes = (await notes(rex)).slice(0, (await notes(rex)).length - before.rex + 1);
      expect((await notes(rex)).some((n: any) => n.title === 'Mo Monthly asked for their pay')).toBe(true);
      expect((await notes(admin)).some((n: any) => n.title === 'Mo Monthly asked for their pay')).toBe(true);
      expect(rexNotes.length).toBeGreaterThan(0);
      // it shows on the recruiter's and Admin's payments, flagged
      const rexView = (await rex.get(`/api/payments/${reqId}`)).body.data;
      expect(rexView.candidateRequest).toMatchObject({ note: 'Rent is due this week' });
      expect((await rex.get('/api/payments?requested=true')).body.data.map((p: any) => p.id)).toContain(reqId);
      expect((await admin.get('/api/payments?requested=true')).body.data.map((p: any) => p.id)).toContain(reqId);
      expect((await ron.get('/api/payments?requested=true')).body.data.map((p: any) => p.id)).not.toContain(reqId);
      await cand.mo.post('/api/payments/request').send({}).expect(409); // already asked
      expect((await cand.mo.get('/api/payments/my-requests')).body.data[0]).toMatchObject({ id: reqId });
      await cand.will.get('/api/payments/my-requests').expect(200);
    });

    it('follows the request through release, confirmation and payout', async () => {
      await rex.post('/api/payments/release-batch').send({ paymentIds: [reqId], method: 'UPI', reference: 'UPI-9' }).expect(200);
      expect((await cand.mo.get('/api/payments/my-requests')).body.data[0].stage).toBe('The company has released it');
      const gross = (await admin.get(`/api/payments/${reqId}`)).body.data.gross;
      await admin.post('/api/payments/confirm-batch').send({ paymentIds: [reqId], amountReceived: gross }).expect(200);
      expect((await cand.mo.get('/api/payments/my-requests')).body.data[0].stage).toBe('Being sent to you');
      await admin.post('/api/payments/payout-batch').send({ paymentIds: [reqId], method: 'UPI', reference: 'OUT-9' }).expect(200);
      const mine = (await cand.mo.get('/api/payments/my-requests')).body.data[0];
      expect(mine).toMatchObject({ stage: 'Sent to you. Please confirm', canConfirm: true });
      await cand.mo.post(`/api/payments/${reqId}/payout/confirm`).expect(200);
      expect((await cand.mo.get('/api/payments/my-requests')).body.data[0].stage).toBe('Paid');
      await cand.mo.post('/api/payments/request').send({ period: periodOf(day(0), 'MONTH') }).expect(409);
    });

    it('a candidate with no contract cannot ask', async () => {
      await reg('candidate', 'Nobody', 'nobody@t.dev');
      const nobody = await login('nobody@t.dev');
      await nobody.post('/api/payments/request').send({}).expect(404);
    });
  });
});
