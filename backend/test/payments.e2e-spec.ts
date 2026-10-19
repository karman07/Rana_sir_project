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
import { Email } from './../src/communication/schemas/email.schema';
import { Payment } from './../src/payments/schemas/payment.schema';
import { LedgerEntry } from './../src/payments/schemas/ledger-entry.schema';
import { PaymentsService } from './../src/payments/payments.service';
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


describe('Commission rules & manual payments (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let paymentsM: Model<Payment>, ledgerM: Model<LedgerEntry>, payments: PaymentsService;
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
    await rex.post(`/api/contracts/${id}/approve`).send({}).expect(200).catch(() => undefined);
    await cand[key].post(`/api/contracts/${id}/approve`).send({}).expect(200);
    return id as string;
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
    paymentsM = moduleRef.get(getModelToken(Payment.name)); ledgerM = moduleRef.get(getModelToken(LedgerEntry.name)); payments = moduleRef.get(PaymentsService);
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); ids[e] = r.body.data.user.id; await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
    await selected('cara', 'Cara Candidate');
    await selected('dan', 'Dan Candidate');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('commission rules', () => {
    it('are Admin-only', async () => {
      await rex.get('/api/commission-rules').expect(403);
      await cand.cara.get('/api/commission-rules').expect(403);
      await rex.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'PERCENT', percent: 5 }).expect(403);
      await request(app.getHttpServer()).get('/api/commission-rules').expect(401);
    });

    it('validate their input', async () => {
      await admin.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'PERCENT' }).expect(400);
      await admin.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'PERCENT', percent: 101 }).expect(400);
      await admin.post('/api/commission-rules').send({ scope: 'RECRUITER', type: 'PERCENT', percent: 10 }).expect(400); // needs a target
      await admin.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'FIXED', amount: 500 }).expect(400); // needs a currency
    });

    it('resolve most-specific first: job, then recruiter, then global, then the built-in default', async () => {
      const resolve = async (q = '') => (await admin.get(`/api/commission-rules/resolve${q}`).expect(200)).body.data;
      expect(await resolve()).toMatchObject({ source: 'DEFAULT', rule: { type: 'PERCENT', basisPoints: 1000 } });
      await admin.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'PERCENT', percent: 15 }).expect(201);
      expect(await resolve()).toMatchObject({ source: 'GLOBAL', rule: { basisPoints: 1500 } });
      await admin.post('/api/commission-rules').send({ scope: 'RECRUITER', refId: ids['ron@t.dev'], type: 'PERCENT', percent: 20 }).expect(201);
      expect(await resolve(`?recruiterId=${ids['ron@t.dev']}`)).toMatchObject({ source: 'RECRUITER', rule: { basisPoints: 2000 } });
      expect(await resolve(`?recruiterId=${ids['rex@t.dev']}`)).toMatchObject({ source: 'GLOBAL' });
      const job = (await admin.post('/api/commission-rules').send({ scope: 'JOB', refId: ids.job, type: 'FIXED', amount: 250_000, currency: 'INR' }).expect(201)).body.data;
      expect(job.refLabel).toMatch(/JOB-/);
      expect(await resolve(`?recruiterId=${ids['ron@t.dev']}&jobId=${ids.job}`)).toMatchObject({ source: 'JOB', rule: { type: 'FIXED', amount: 250_000 } });
      await admin.delete(`/api/commission-rules/${job.id}`).expect(200);
      await admin.delete(`/api/commission-rules/${job.id}`).expect(404); // already off
      expect(await resolve(`?jobId=${ids.job}`)).toMatchObject({ source: 'GLOBAL' });
    });

    it('a replaced rule stays on record, and a new contract starts from the resolved rule', async () => {
      await admin.post('/api/commission-rules').send({ scope: 'GLOBAL', type: 'PERCENT', percent: 15 }).expect(201); // replaces the earlier global rule
      const list = (await admin.get('/api/commission-rules').expect(200)).body.data.items;
      expect(list.filter((r: any) => r.scope === 'GLOBAL').map((r: any) => r.active)).toEqual([true, false]);
      ids.cCara = await activate('cara');
      const c = (await admin.get(`/api/contracts/${ids.cCara}`)).body.data;
      expect(c.terms.commission).toEqual({ type: 'PERCENT', basisPoints: 1500 });
      expect(c.financials.monthly).toEqual({ grossAmount: 10_000_000, commission: 1_500_000, candidateAmount: 8_500_000, platformAmount: 1_500_000 });
    });
  });

  describe('generating payments', () => {
    it('is Admin-only and works from the contract as it stands', async () => {
      await rex.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(403);
      await cand.cara.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(403);
      await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: '2026-13' }).expect(400);
      await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: '1999-01' }).expect(400); // before the contract
      const r = await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(201);
      ids.pay = r.body.data.id;
      expect(r.body.data).toMatchObject({
        paymentNumber: 'PAY-0001', status: 'AWAITING_CLIENT', period: period(1), currency: 'INR',
        gross: 10_000_000, commission: 1_500_000, candidateAmount: 8_500_000, client: { status: 'AWAITING' }, payout: { status: 'NOT_DUE' },
      });
      expect(r.body.data.transactionId).toMatch(/^TXN-\d{8}-[0-9A-F]{6}$/);
      const dup = await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(409);
      expect(dup.body.error.code).toBe('PAYMENT_EXISTS');
    });

    it('does the ₹100,000 → ₹15,000 / ₹85,000 split on the server', async () => {
      const p = (await admin.get(`/api/payments/${ids.pay}`)).body.data;
      expect([p.gross, p.commission, p.candidateAmount]).toEqual([10_000_000, 1_500_000, 8_500_000]);
    });

    it('the automatic run fills in missed months once, and only within the contract', async () => {
      const first = await admin.post('/api/payments/billing/run').expect(200);
      expect(first.body.data.created).toBe(2); // the two other completed months in the 3-month window
      const again = await admin.post('/api/payments/billing/run').expect(200);
      expect(again.body.data.created).toBe(0);
      expect((await admin.get('/api/payments?limit=50')).body.meta.total).toBe(3);
      expect((await paymentsM.find().sort({ paymentNumber: 1 }).lean()).map((p) => p.paymentNumber)).toEqual(['PAY-0001', 'PAY-0002', 'PAY-0003']); // no gaps from repeat runs
    });

    it('later contract changes never rewrite an existing payment', async () => {
      const before = (await admin.get(`/api/payments/${ids.pay}`)).body.data;
      const r = await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 12_000_000, reason: 'Raise from next month' }).expect(201);
      expect(r.body.data.currentVersion).toBe(2);
      const after = (await admin.get(`/api/payments/${ids.pay}`)).body.data;
      expect([after.gross, after.commission, after.candidateAmount, after.contractVersion]).toEqual([before.gross, before.commission, before.candidateAmount, before.contractVersion]);
    });
  });

  describe('company → us (mutual confirmation)', () => {
    it('only the owning recruiter can record it, with a method and a reference', async () => {
      await ron.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR1' }).expect(404);
      await cand.cara.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'x', reference: 'y' }).expect(403);
      await rex.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer' }).expect(400);
      const r = await rex.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR-778899', note: 'Paid by Acme finance' }).expect(200);
      expect(r.body.data.status).toBe('CLIENT_PAID');
      expect(r.body.data.client).toMatchObject({ status: 'MARKED_PAID', amountSent: 10_000_000, reference: 'UTR-778899' });
      await rex.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'again' }).expect(409);
    });

    it('waits for Admin in the Approval Center', async () => {
      const s = (await admin.get('/api/approvals/summary')).body.data;
      expect(s.byCategory.PAYMENT_CONFIRMATION).toBe(1);
      const items = (await admin.get('/api/approvals?category=PAYMENT_CONFIRMATION')).body.data.items ?? (await admin.get('/api/approvals?category=PAYMENT_CONFIRMATION')).body.data;
      expect(JSON.stringify(items)).toContain('PAY-0001');
    });

    it('a recruiter can attach proof; only they and Admin can open it', async () => {
      await rex.post(`/api/payments/${ids.pay}/proof?leg=client`).expect(400);
      await rex.post(`/api/payments/${ids.pay}/proof?leg=payout`).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(403);
      await rex.post(`/api/payments/${ids.pay}/proof?leg=client`).attach('file', Buffer.from('not an image'), { filename: 'p.png', contentType: 'image/png' }).expect(400);
      const r = await rex.post(`/api/payments/${ids.pay}/proof?leg=client`).attach('file', PNG, { filename: 'transfer.png', contentType: 'image/png' }).expect(200);
      ids.clientProof = r.body.data.client.proofDocumentId;
      expect(ids.clientProof).toBeTruthy();
      await rex.get(`/api/documents/${ids.clientProof}/download`).expect(200);
      await admin.get(`/api/documents/${ids.clientProof}/download`).expect(200);
      await ron.get(`/api/documents/${ids.clientProof}/download`).expect(404);
      await cand.cara.get(`/api/documents/${ids.clientProof}/download`).expect(404);
    });

    it('a wrong amount is a dispute, not a silent shortfall; the company can record it again', async () => {
      await rex.post(`/api/payments/${ids.pay}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(403);
      const r = await admin.post(`/api/payments/${ids.pay}/client/confirm`).send({ amountReceived: 9_000_000 }).expect(200);
      expect(r.body.data.status).toBe('DISPUTED');
      expect(r.body.data.client.disputeNote).toMatch(/Expected ₹100,000.*received ₹90,000/);
      expect((await rex.get(`/api/payments/${ids.pay}`)).body.data.actions).toContain('mark-paid');
      expect((await notes(rex)).some((n: any) => n.title.startsWith('Payment needs attention'))).toBe(true);
      await rex.post(`/api/payments/${ids.pay}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR-TOPUP', amount: 10_000_000 }).expect(200);
      expect((await admin.get(`/api/payments/${ids.pay}`)).body.data.status).toBe('CLIENT_PAID');
    });

    it('the candidate hears nothing until the money is in', async () => {
      expect((await cand.cara.get('/api/payments')).body.data).toEqual([]);
      await cand.cara.get(`/api/payments/${ids.pay}`).expect(404);
    });

    it('Admin confirming the full amount makes it received and writes the ledger', async () => {
      const r = await admin.post(`/api/payments/${ids.pay}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
      expect(r.body.data).toMatchObject({ status: 'RECEIVED', client: { status: 'RECEIVED' }, payout: { status: 'PENDING' } });
      expect(r.body.data.ledger.map((l: any) => [l.type, l.amount])).toEqual([['CLIENT_RECEIPT', 10_000_000], ['COMMISSION', 1_500_000]]);
      await admin.post(`/api/payments/${ids.pay}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(409);
      expect((await notes(rex)).some((n: any) => n.title.startsWith('Payment received'))).toBe(true);
    });
  });

  describe('us → candidate', () => {
    it('shows the candidate only their own pay, never the company amount or our commission', async () => {
      const list = (await cand.cara.get('/api/payments')).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ amount: 8_500_000, status: 'PROCESSING', currency: 'INR' });
      const detail = (await cand.cara.get(`/api/payments/${ids.pay}`).expect(200)).body.data;
      expect(JSON.stringify(detail)).not.toMatch(/commission|gross|10000000|1500000|recruiter|rule|client/i);
    });

    it('shows the recruiter only what the company owes, never the commission or the candidate split', async () => {
      const detail = (await rex.get(`/api/payments/${ids.pay}`).expect(200)).body.data;
      expect(detail.amountDue).toBe(10_000_000);
      expect(JSON.stringify(detail)).not.toMatch(/commission|candidateAmount|8500000|1500000|payout|rule/i);
      const list = (await rex.get('/api/payments')).body.data;
      expect(JSON.stringify(list)).not.toMatch(/commission|candidateAmount|payout/i);
    });

    it('only Admin sends the payout, and the candidate confirms it', async () => {
      await rex.post(`/api/payments/${ids.pay}/payout/send`).send({ method: 'UPI', reference: 'x' }).expect(403);
      await cand.cara.post(`/api/payments/${ids.pay}/payout/confirm`).expect(409); // nothing sent yet
      const r = await admin.post(`/api/payments/${ids.pay}/payout/send`).send({ method: 'UPI', reference: 'UPI-5551212' }).expect(200);
      expect(r.body.data).toMatchObject({ status: 'PAYOUT_SENT', payout: { status: 'SENT', amountSent: 8_500_000, reference: 'UPI-5551212' } });
      expect(r.body.data.ledger.map((l: any) => [l.type, l.amount])).toEqual([['CLIENT_RECEIPT', 10_000_000], ['COMMISSION', 1_500_000], ['CANDIDATE_PAYOUT', -8_500_000]]);
      expect((await notes(cand.cara)).some((n: any) => n.title.startsWith('Your pay was sent'))).toBe(true);
      const proof = await admin.post(`/api/payments/${ids.pay}/proof?leg=payout`).attach('file', PNG, { filename: 'payout.png', contentType: 'image/png' }).expect(200);
      ids.payoutProof = proof.body.data.payout.proofDocumentId;
      await cand.cara.get(`/api/documents/${ids.payoutProof}/download`).expect(200);
      await rex.get(`/api/documents/${ids.payoutProof}/download`).expect(404);
      const mine = (await cand.cara.get(`/api/payments/${ids.pay}`)).body.data;
      expect(mine).toMatchObject({ status: 'SENT', actions: ['confirm-payout', 'dispute-payout'], payout: { reference: 'UPI-5551212' } });
    });

    it('a candidate who did not get it can dispute; Admin re-sends and the candidate confirms', async () => {
      await cand.cara.post(`/api/payments/${ids.pay}/payout/dispute`).send({}).expect(400);
      const d = await cand.cara.post(`/api/payments/${ids.pay}/payout/dispute`).send({ note: 'Nothing arrived in my account' }).expect(200);
      expect(d.body.data.status).toBe('DISPUTED');
      expect((await notes(admin)).some((n: any) => n.title.startsWith('Payout disputed'))).toBe(true);
      await admin.post(`/api/payments/${ids.pay}/payout/send`).send({ method: 'Bank transfer', reference: 'NEFT-2' }).expect(200);
      const ok = await cand.cara.post(`/api/payments/${ids.pay}/payout/confirm`).expect(200);
      expect(ok.body.data.status).toBe('RECEIVED');
      const done = (await admin.get(`/api/payments/${ids.pay}`)).body.data;
      expect(done).toMatchObject({ status: 'COMPLETED', payout: { status: 'CONFIRMED' } });
      expect(done.history.map((h: any) => h.status)).toEqual(['AWAITING_CLIENT', 'CLIENT_PAID', 'DISPUTED', 'CLIENT_PAID', 'RECEIVED', 'PAYOUT_SENT', 'DISPUTED', 'PAYOUT_SENT', 'COMPLETED']);
      await cand.cara.post(`/api/payments/${ids.pay}/payout/confirm`).expect(409);
    });
  });

  describe('corrections & records', () => {
    it('Admin can cancel or adjust only before any money has moved', async () => {
      const open = (await admin.get(`/api/payments?statuses=AWAITING_CLIENT&limit=10`)).body.data[0];
      await rex.post(`/api/payments/${open.id}/cancel`).send({ note: 'no' }).expect(403);
      await admin.post(`/api/payments/${open.id}/cancel`).send({}).expect(400);
      await admin.post(`/api/payments/${open.id}/adjust`).send({ grossAmount: 9_000_000, reason: 'Unpaid leave in the month' }).expect(200);
      const adj = (await admin.get(`/api/payments/${open.id}`)).body.data;
      expect([adj.gross, adj.commission, adj.candidateAmount]).toEqual([9_000_000, 1_350_000, 7_650_000]);
      await admin.post(`/api/payments/${open.id}/adjust`).send({ hoursWorked: 10, reason: 'x y z' }).expect(400); // not an hourly contract
      await admin.post(`/api/payments/${open.id}/cancel`).send({ note: 'Billed in error' }).expect(200);
      expect((await rex.get(`/api/payments/${open.id}`)).body.data.status).toBe('CANCELLED');
      await admin.post(`/api/payments/${open.id}/cancel`).send({ note: 'again' }).expect(409);
      await admin.post(`/api/payments/${ids.pay}/cancel`).send({ note: 'too late' }).expect(409); // already completed
      await admin.post(`/api/payments/${ids.pay}/adjust`).send({ grossAmount: 1, reason: 'too late' }).expect(409);
    });

    it('hourly contracts are billed from the hours worked', async () => {
      ids.cDan = await activate('dan', { salaryPeriod: 'HOUR', salaryAmount: 50_000, hoursPerWeek: 20 });
      const r = await admin.post('/api/payments/generate').send({ contractId: ids.cDan, period: period(1), hoursWorked: 80 }).expect(201);
      expect([r.body.data.gross, r.body.data.commission, r.body.data.candidateAmount]).toEqual([4_000_000, 600_000, 3_400_000]);
      const adj = await admin.post(`/api/payments/${r.body.data.id}/adjust`).send({ hoursWorked: 90, reason: 'Extra shift' }).expect(200);
      expect(adj.body.data).toMatchObject({ gross: 4_500_000, hoursWorked: 90 });
    });

    it('the ledger is append-only and the summary adds it up per currency', async () => {
      const ledger = (await admin.get('/api/payments/ledger?limit=50')).body.data;
      expect(ledger).toHaveLength(5); // receipt, commission, payout, its reversal after the dispute, and the re-sent payout
      expect(ledger.reduce((n: number, l: any) => n + l.amount, 0)).toBe(10_000_000 + 1_500_000 - 8_500_000); // reversal cancels the first payout
      await rex.get('/api/payments/ledger').expect(403);
      await cand.cara.get('/api/payments/summary').expect(403);
      const s = (await admin.get('/api/payments/summary')).body.data;
      const inr = s.totals.find((t: any) => t.currency === 'INR');
      expect(inr.commissionEarned).toBe(1_500_000);
      expect(inr.paidOut).toBe(8_500_000);
      expect(s.commissionByPeriod).toEqual([{ period: period(1), currency: 'INR', commission: 1_500_000 }]);
      expect(await ledgerM.countDocuments({})).toBe(5);
    });

    it('records every step in the audit log', async () => {
      const log = (await admin.get(`/api/audit-logs?entityType=Payment&entityId=${ids.pay}&limit=50`)).body.data;
      const actions = log.map((l: any) => l.action);
      for (const a of ['PAYMENT_GENERATED', 'PAYMENT_CLIENT_PAID', 'PAYMENT_DISPUTED', 'PAYMENT_RECEIVED', 'PAYMENT_PAYOUT_SENT', 'PAYMENT_PAYOUT_CONFIRMED']) expect(actions).toContain(a);
      const rules = (await admin.get('/api/audit-logs?entityType=CommissionRule&limit=50')).body.data;
      expect(rules.length).toBeGreaterThanOrEqual(4);
    });

    it('flags late payments once', async () => {
      const dan = (await admin.get(`/api/payments?contractId=${ids.cDan}`)).body.data[0];
      await paymentsM.updateOne({ _id: dan.id }, { dueDate: day(-3) });
      expect((await admin.get('/api/payments?overdue=true')).body.data.map((p: any) => p.id)).toContain(dan.id);
      expect((await payments.runBilling()).overdue).toBeGreaterThanOrEqual(1);
      expect((await payments.runBilling()).overdue).toBe(0);
      expect((await notes(rex)).some((n: any) => n.title.startsWith('Payment overdue'))).toBe(true);
    });

    it('releasing a different amount recalculates our commission and the candidate share straight away', async () => {
      const id = (await admin.get(`/api/payments?contractId=${ids.cDan}`)).body.data[0].id; // 4,500,000 due after the extra shift
      const released = await admin.post(`/api/payments/${id}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR-SHORT', amount: 4_000_000 }).expect(200);
      expect([released.body.data.gross, released.body.data.commission, released.body.data.candidateAmount]).toEqual([4_000_000, 600_000, 3_400_000]); // 15% of what was released
      expect((await admin.get('/api/payments/summary')).body.data.totals[0].commissionPending).toBeGreaterThan(0);
      const done = await admin.post(`/api/payments/${id}/client/confirm`).send({ amountReceived: 4_000_000 }).expect(200);
      expect(done.body.data.status).toBe('RECEIVED');
      expect(done.body.data.ledger.map((l: any) => [l.type, l.amount])).toEqual([['CLIENT_RECEIPT', 4_000_000], ['COMMISSION', 600_000]]);
    });
  });
});
