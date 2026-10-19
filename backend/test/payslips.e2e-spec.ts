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
import { Payslip } from './../src/payslips/schemas/payslip.schema';
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




describe('Payslips & PDF (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let payslipsM: Model<Payslip>, emails: Model<Email>;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>;
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
  /** Takes a payment through to "the candidate has been paid". */
  const pay = async (contractId: string, p: string, hours?: number) => {
    const id = (await admin.post('/api/payments/generate').send({ contractId, period: p, hoursWorked: hours }).expect(201)).body.data.id;
    const gross = (await admin.get(`/api/payments/${id}`)).body.data.gross;
    await rex.post(`/api/payments/${id}/client/mark-paid`).send({ method: 'Bank transfer', reference: `UTR-${p}` }).expect(200);
    await admin.post(`/api/payments/${id}/client/confirm`).send({ amountReceived: gross }).expect(200);
    await admin.post(`/api/payments/${id}/payout/send`).send({ method: 'UPI', reference: `UPI-${p}` }).expect(200);
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
    payslipsM = moduleRef.get(getModelToken(Payslip.name)); emails = moduleRef.get(getModelToken(Email.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    const r = await reg('recruiter', 'Rex Agent', 'rex@t.dev'); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200);
    rex = await login('rex@t.dev');
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

  it('is issued the moment the candidate is paid, and not before', async () => {
    const p = (await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(1) }).expect(201)).body.data.id;
    expect(await payslipsM.countDocuments({})).toBe(0);
    await admin.post('/api/payslips/generate').send({ paymentId: p }).expect(409); // nothing paid yet
    await rex.post(`/api/payments/${p}/client/mark-paid`).send({ method: 'Bank transfer', reference: 'UTR1' }).expect(200);
    await admin.post(`/api/payments/${p}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
    expect(await payslipsM.countDocuments({})).toBe(0); // money in, candidate not yet paid
    await admin.post(`/api/payments/${p}/payout/send`).send({ method: 'UPI', reference: 'UPI1' }).expect(200);
    expect(await payslipsM.countDocuments({})).toBe(1);
    ids.pay1 = p;
  });

  it('shows the candidate their own figures and nothing about how the platform earns', async () => {
    const list = (await cand.cara.get('/api/payslips')).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ payslipNumber: 'PSL-0001', period: period(1), netPay: 9_000_000, currency: 'INR', contractNumber: 'CON-0001', jobTitle: 'Backend Engineer', company: 'Acme' });
    ids.slip = list[0].id;
    const d = (await cand.cara.get(`/api/payslips/${ids.slip}`).expect(200)).body.data;
    expect(d.data).toMatchObject({ netPay: 9_000_000, rate: 9_000_000, payBasis: 'MONTH', candidate: { name: 'Cara Candidate' }, payment: { method: 'UPI', reference: 'UPI1' } });
    expect(d.data.lines).toEqual([{ label: expect.stringMatching(/^Pay for /), amount: 9_000_000 }]);
    expect(d.verified).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/commission|gross|recruiter|rule|platform|10000000|1000000\b/i);
  });

  it('comes with a PDF only the candidate and Admin can open', async () => {
    const d = (await cand.cara.get(`/api/payslips/${ids.slip}`)).body.data;
    const res = await cand.cara.get(`/api/documents/${d.pdfDocumentId}/download`).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((res.body as Buffer).length).toBeGreaterThan(1500);
    await admin.get(`/api/documents/${d.pdfDocumentId}/download`).expect(200);
    await rex.get(`/api/documents/${d.pdfDocumentId}/download`).expect(404); // the recruiter must never see a candidate's pay
    await cand.dan.get(`/api/documents/${d.pdfDocumentId}/download`).expect(404);
    await request(app.getHttpServer()).get(`/api/documents/${d.pdfDocumentId}/download`).expect(401);
    expect((await cand.cara.get('/api/documents')).body.data.some((x: any) => x.type === 'PAYSLIP')).toBe(true);
  });

  it('is private: candidates see only their own, recruiters none, Admin all', async () => {
    expect((await cand.dan.get('/api/payslips')).body.data).toEqual([]);
    await cand.dan.get(`/api/payslips/${ids.slip}`).expect(404);
    await rex.get('/api/payslips').expect(403);
    await rex.get(`/api/payslips/${ids.slip}`).expect(403);
    await request(app.getHttpServer()).get('/api/payslips').expect(401);
    const all = (await admin.get('/api/payslips?search=Cara')).body.data;
    expect(all).toHaveLength(1);
    expect((await admin.get(`/api/payslips/${ids.slip}`)).body.data.verified).toBe(true);
  });

  it('tells the candidate by notification and email', async () => {
    const n = (await notes(cand.cara)).find((x: any) => /payslip is ready/.test(x.title));
    expect(n).toMatchObject({ title: `Your ${period(1)} payslip is ready`, link: `/candidate/payslips/${ids.slip}` });
    expect(await emails.findOne({ to: 'cara@t.dev', subject: new RegExp(`Your payslip for ${period(1)}`) }).lean()).toBeTruthy();
    const log = (await admin.get(`/api/audit-logs?entityType=Payslip&entityId=${ids.slip}`)).body.data.map((l: any) => l.action);
    expect(log).toContain('PAYSLIP_GENERATED');
  });

  it('stays exactly as issued after a contract revision', async () => {
    const before = (await cand.cara.get(`/api/payslips/${ids.slip}`)).body.data;
    await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 15_000_000, reason: 'Raise' }).expect(201);
    expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data.currentVersion).toBe(2);
    const after = (await cand.cara.get(`/api/payslips/${ids.slip}`)).body.data;
    expect(after.data).toEqual(before.data);
    expect(after).toMatchObject({ netPay: 9_000_000, verified: true, verificationCode: before.verificationCode });
    expect(after.data.contractVersion).toBe(1);
    // the next payslip uses the new terms
    const p2 = await pay(ids.cCara, period(2));
    const next = (await cand.cara.get('/api/payslips?sort=-createdAt')).body.data[0];
    expect(next).toMatchObject({ payslipNumber: 'PSL-0002', netPay: 13_500_000 });
    expect(p2).toBeTruthy();
  });

  it('cannot be changed or deleted, even by the code itself, and tampering shows', async () => {
    await expect(payslipsM.updateOne({ _id: ids.slip }, { netPay: 1 })).rejects.toThrow(/immutable/);
    await expect(payslipsM.findOneAndUpdate({ _id: ids.slip }, { netPay: 1 })).rejects.toThrow(/immutable/);
    await expect(payslipsM.deleteOne({ _id: ids.slip })).rejects.toThrow(/immutable/);
    await expect(payslipsM.deleteMany({})).rejects.toThrow(/immutable/);
    const doc = await payslipsM.findById(ids.slip);
    doc!.netPay = 5;
    await expect(doc!.save()).rejects.toThrow(/immutable/);
    // someone editing the database directly cannot do it unnoticed
    await conn.collection('payslips').updateOne({ _id: doc!._id }, { $set: { 'data.netPay': 99_999_999 } });
    expect((await admin.get(`/api/payslips/${ids.slip}`)).body.data.verified).toBe(false);
    await conn.collection('payslips').updateOne({ _id: doc!._id }, { $set: { 'data.netPay': 9_000_000 } });
    expect((await admin.get(`/api/payslips/${ids.slip}`)).body.data.verified).toBe(true);
  });

  it('is issued once per payment, even when a disputed payout is sent again', async () => {
    await admin.post('/api/payslips/generate').send({ paymentId: ids.pay1 }).expect(409);
    await cand.cara.post(`/api/payments/${ids.pay1}/payout/dispute`).send({ note: 'Nothing arrived' }).expect(200);
    await admin.post(`/api/payments/${ids.pay1}/payout/send`).send({ method: 'Bank transfer', reference: 'NEFT-2' }).expect(200);
    expect(await payslipsM.countDocuments({ paymentId: ids.pay1 })).toBe(1);
    await cand.cara.post('/api/payslips/generate').send({ paymentId: ids.pay1 }).expect(403);
  });

  it('can be issued by hand when one was missed', async () => {
    expect((await admin.get('/api/payslips/missing')).body.data).toEqual([]);
    await conn.collection('payslips').deleteOne({ paymentId: new Types.ObjectId(ids.pay1) }); // simulate a miss, below the app's own guard
    const missing = (await admin.get('/api/payslips/missing')).body.data;
    expect(missing).toHaveLength(1);
    expect(missing[0].paymentId).toBe(ids.pay1);
    const r = await admin.post('/api/payslips/generate').send({ paymentId: ids.pay1 }).expect(201);
    expect(r.body.data).toMatchObject({ payslipNumber: 'PSL-0003', netPay: 9_000_000, period: period(1) });
  });

  it('shows hours and the candidate\'s own rate for an hourly contract', async () => {
    ids.cDan = await activate('dan', { salaryPeriod: 'HOUR', salaryAmount: 50_000, hoursPerWeek: 20 });
    await pay(ids.cDan, period(1), 80);
    const list = (await cand.dan.get('/api/payslips')).body.data;
    const d = (await cand.dan.get(`/api/payslips/${list[0].id}`)).body.data;
    expect(d.data).toMatchObject({ payBasis: 'HOUR', rate: 45_000, hoursWorked: 80, netPay: 3_600_000 });
    expect(d.data.lines[0]).toMatchObject({ detail: '80 hours', amount: 3_600_000 });
  });

  it('links from the salary record', async () => {
    const s = (await cand.cara.get(`/api/salaries?statuses=PAID&limit=10`)).body.data.find((x: any) => x.period === period(1));
    expect(s.payslipId).toBeTruthy();
    expect((await cand.cara.get(`/api/payslips/${s.payslipId}`)).status).toBe(200);
  });
});
