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
import ExcelJS from 'exceljs';
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





const text = (r: any, cb: any) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); };

describe('Reports & exports (e2e)', () => {
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
  const pay = async (contractId: string, p: string) => {
    const id = (await admin.post('/api/payments/generate').send({ contractId, period: p }).expect(201)).body.data.id;
    await rex.post(`/api/payments/${id}/client/mark-paid`).send({ method: 'Bank transfer', reference: `UTR-${p}` }).expect(200);
    await admin.post(`/api/payments/${id}/client/confirm`).send({ amountReceived: 10_000_000 }).expect(200);
    await admin.post(`/api/payments/${id}/payout/send`).send({ method: 'UPI', reference: `UPI-${p}` }).expect(200);
    await cand.cara.post(`/api/payments/${id}/payout/confirm`).expect(200);
    return id as string;
  };
  const get = (a: typeof admin, url: string) => a.get(url).buffer(true).parse(text);
  const csv = async (a: typeof admin, ds: string, q = '') => { const r = await get(a, `/api/exports/${ds}?format=csv${q}`).expect(200); return { res: r, text: (r.body as Buffer).toString('utf8') }; };

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
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
    await selected('cara', 'Cara Candidate');
    await selected('dan', '=Malicious()');
    // a third candidate who only applied, so the funnel has a visible drop-off
    await reg('candidate', 'Eve Applicant', 'eve@t.dev'); cand.eve = await login('eve@t.dev');
    await cand.eve.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
    await cand.eve.post('/api/applications').send({ jobId: ids.job }).expect(201);
    ids.cCara = await activate('cara');
    await pay(ids.cCara, period(1)); // a complete payment: company paid, we paid, candidate confirmed
    await admin.post('/api/payments/generate').send({ contractId: ids.cCara, period: period(2) }).expect(201); // and one still waiting
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('reports', () => {
    it('are limited to the role they are for, and validate the period', async () => {
      await rex.get('/api/analytics/admin/recruitment').expect(403);
      await cand.cara.get('/api/analytics/admin/financial').expect(403);
      await admin.get('/api/analytics/recruiter/report').expect(403);
      await rex.get('/api/analytics/candidate/report').expect(403);
      await admin.get('/api/analytics/admin/recruitment?period=forever').expect(400);
      await admin.get('/api/analytics/admin/financial?currency=RUPEES').expect(400);
      await request(app.getHttpServer()).get('/api/analytics/admin/recruitment').expect(401);
    });

    it('Admin recruitment: a funnel that never grows downward, a dense series, and the top jobs', async () => {
      const r = (await admin.get('/api/analytics/admin/recruitment?period=7d').expect(200)).body.data;
      expect(r).toMatchObject({ period: '7d', bucket: 'day' });
      expect(r.series).toHaveLength(7);
      expect(r.series.at(-1)).toMatchObject({ applications: 3, selected: 2 });
      const f = Object.fromEntries(r.funnel.map((x: any) => [x.key, x.count]));
      expect(f).toMatchObject({ applications: 3, shortlisted: 2, sentToRecruiter: 2, recruiterApproved: 2, interview: 2, selected: 2 });
      const counts = r.funnel.map((x: any) => x.count);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      expect(r.kpis).toMatchObject({ applications: 3, selected: 2, applicationToSelected: 66.7 });
      expect(r.topJobs[0]).toMatchObject({ applications: 3, selected: 2, jobNumber: expect.stringMatching(/^JOB-/), company: 'Acme' });
      expect(r.byStatus.find((s: any) => s.status === 'APPLIED').count).toBe(1);
      for (const p of ['30d', '90d', '12m', 'all']) expect((await admin.get(`/api/analytics/admin/recruitment?period=${p}`).expect(200)).body.data.kpis.applications).toBe(3);
      expect((await admin.get('/api/analytics/admin/recruitment?period=12m')).body.data.series).toHaveLength(12);
    });

    it('Admin financial: billed, earned and paid out in one currency, by month', async () => {
      const r = (await admin.get('/api/analytics/admin/financial?period=12m').expect(200)).body.data;
      expect(r).toMatchObject({ currency: 'INR', currencies: ['INR'], bucket: 'month' });
      expect(r.kpis).toMatchObject({ billed: 20_000_000, commission: 1_000_000, paidOut: 9_000_000, awaiting: 10_000_000, owedToCandidates: 0, disputed: 0 });
      expect(r.series).toEqual([{ bucket: period(2), billed: 10_000_000, commission: 0, paidOut: 0 }, { bucket: period(1), billed: 10_000_000, commission: 1_000_000, paidOut: 9_000_000 }]);
      expect(r.contracts.active).toBe(1);
      expect(r.performance).toMatchObject({ paidPayments: 1 });
      expect((await admin.get('/api/analytics/admin/financial?currency=usd')).body.data.currency).toBe('INR'); // not a currency in use: falls back
    });

    it('Admin recruiters: how each one performs', async () => {
      const r = (await admin.get('/api/analytics/admin/recruiters?period=all').expect(200)).body.data;
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ name: 'Rex Agent', sent: 2, approved: 2, approvalRate: 100, selected: 2, liveJobs: 1, activeContracts: 1, overduePayments: 1 }); // last month's payment is still unpaid and past due
      expect(r.rows[0].daysToDecide).toBeGreaterThanOrEqual(0);
    });

    it('Admin candidates: sign-ups, verification and reach', async () => {
      const r = (await admin.get('/api/analytics/admin/candidates?period=30d').expect(200)).body.data;
      expect(r.kpis).toMatchObject({ total: 3, active: 3, newInPeriod: 3, applyingCandidates: 3, avgApplications: 1 });
      expect(r.series.reduce((n: number, s: any) => n + s.candidates, 0)).toBe(3);
    });

    it('Recruiter: only their own, and nothing about the commission or the candidate\'s share', async () => {
      const r = (await rex.get('/api/analytics/recruiter/report?period=all').expect(200)).body.data;
      expect(r.kpis).toMatchObject({ received: 2, approved: 2, approvalRate: 100, selected: 2 });
      expect(r.funnel.map((f: any) => f.key)).not.toContain('shortlisted');
      expect(r.jobs[0]).toMatchObject({ applications: 3, selected: 2 });
      expect(r.payments).toEqual([{ currency: 'INR', due: 10_000_000, paid: 10_000_000 }]);
      expect(JSON.stringify(r)).not.toMatch(/commission|candidateAmount|9000000|1000000\b|payout/i);
      const other = (await ron.get('/api/analytics/recruiter/report?period=all').expect(200)).body.data;
      expect(other.kpis).toMatchObject({ received: 0, selected: 0 });
      expect(other.payments).toEqual([]);
    });

    it('Candidate: only their own, with their own pay', async () => {
      const r = (await cand.cara.get('/api/analytics/candidate/report?period=all').expect(200)).body.data;
      expect(r.kpis).toMatchObject({ applications: 1, activeContracts: 1 });
      expect(r.earnings).toEqual([{ currency: 'INR', total: 9_000_000, months: [{ bucket: period(1), net: 9_000_000 }] }]);
      expect(r.upcoming.length).toBeGreaterThan(0);
      expect(JSON.stringify(r)).not.toMatch(/commission|gross|10000000|recruiter/i);
      expect((await cand.eve.get('/api/analytics/candidate/report?period=all')).body.data.earnings).toEqual([]);
    });
  });

  describe('exports', () => {
    it('follow the same access rules as the pages', async () => {
      for (const ds of ['candidates', 'commissions']) { await rex.get(`/api/exports/${ds}`).expect(403); await cand.cara.get(`/api/exports/${ds}`).expect(403); }
      await rex.get('/api/exports/payslips').expect(403);
      await cand.cara.get('/api/exports/jobs').expect(403);
      await request(app.getHttpServer()).get('/api/exports/payments').expect(401);
      await admin.get('/api/exports/secrets').expect(400);
      await admin.get('/api/exports/payments?format=pdf').expect(400);
      await admin.get('/api/exports/payments?period=never').expect(400);
      for (const ds of ['candidates', 'applications', 'jobs', 'payments', 'commissions', 'salary', 'payslips', 'contracts']) await get(admin, `/api/exports/${ds}?format=csv`).expect(200);
    });

    it('give Admin the full payment picture as CSV Excel opens correctly', async () => {
      const { res, text: t } = await csv(admin, 'payments');
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="payments-\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(res.headers['x-row-count']).toBe('2');
      expect(t.charCodeAt(0)).toBe(0xfeff);
      const lines = t.trim().split('\r\n');
      expect(lines[0]).toContain('Company pays,Commission,Candidate receives');
      expect(lines).toHaveLength(3);
      expect(t).toContain('100000.00,10000.00,90000.00'); // money in whole currency units, ready to sum
      expect(t).toContain(`UTR-${period(1)}`);
    });

    it('give a recruiter only the company side', async () => {
      const t = (await csv(rex, 'payments')).text;
      expect(t.split('\r\n')[0]).toContain('Amount due');
      expect(t).not.toMatch(/Commission|Candidate receives|Transaction ID|Paid out/);
      expect(t).not.toContain('10000.00');
      expect(t).not.toContain('90000.00');
      expect(t).toContain('100000.00');
      expect((await csv(ron, 'payments')).text.trim().split('\r\n')).toHaveLength(1); // header only: not theirs
      expect((await csv(rex, 'salary')).text).not.toMatch(/Candidate pay|90000/);
      const contracts = (await csv(rex, 'contracts')).text;
      expect(contracts).not.toMatch(/Commission|10%|10\.00%/);
    });

    it('give a candidate only their own pay, never the company amount or any commission', async () => {
      const t = (await csv(cand.cara, 'payments')).text;
      expect(t.split('\r\n')[0]).toContain('Your pay');
      expect(t).toContain('90000.00');
      expect(t).not.toMatch(/100000\.00|Commission|Company|Transaction|Recruiter/);
      const contracts = (await csv(cand.cara, 'contracts')).text;
      expect(contracts).toContain('90000.00'); // the figure they receive, as everywhere else they see it
      expect(contracts).not.toContain('100000.00');
      expect(contracts).not.toMatch(/Commission|Recruiter/);
      const slips = (await csv(cand.cara, 'payslips')).text;
      expect(slips).toContain('90000.00');
      expect((await csv(cand.dan, 'payslips')).text.trim().split('\r\n')).toHaveLength(1);
      expect((await csv(cand.dan, 'payments')).text.trim().split('\r\n')).toHaveLength(1);
    });

    it('give Admin the commission statement', async () => {
      const t = (await csv(admin, 'commissions')).text;
      expect(t.replace(/^\uFEFF/, '').split('\r\n')[0]).toBe('Payment #,Contract,Recruiter,Candidate,Period,Currency,Gross,Rule,Commission,Earned (money received),Payment status');
      expect(t).toMatch(/INR,100000\.00,10%,10000\.00,Yes,COMPLETED/);
      expect(t).toMatch(/INR,100000\.00,10%,10000\.00,No,AWAITING_CLIENT/);
    });

    it('write a real workbook with numbers as numbers', async () => {
      const r = await get(admin, '/api/exports/payments?format=xlsx').expect(200);
      expect(r.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.body as never);
      const ws = wb.getWorksheet('Payments')!;
      const header = (ws.getRow(1).values as string[]).slice(1);
      expect(header).toContain('Company pays');
      const col = header.indexOf('Company pays') + 1;
      expect(ws.getRow(2).getCell(col).value).toBe(100000);
      expect(ws.getColumn(col).numFmt).toBe('#,##0.00');
      expect(ws.rowCount).toBe(3);
    });

    it('defuse spreadsheet formulas typed into names', async () => {
      const t = (await csv(admin, 'candidates')).text;
      expect(t).toContain("'=Malicious()");
      expect(t).not.toMatch(/\r\n=Malicious|,=Malicious/);
      expect((await csv(admin, 'applications')).text).toContain("'=Malicious()");
    });

    it('filter by period and status, and show recruiters only candidates sent to them', async () => {
      expect((await csv(admin, 'applications', '&status=APPLIED')).text.trim().split('\r\n')).toHaveLength(2);
      expect((await csv(admin, 'applications', '&period=7d')).text.trim().split('\r\n')).toHaveLength(4);
      const rexApps = (await csv(rex, 'applications')).text;
      expect(rexApps.trim().split('\r\n')).toHaveLength(3); // Eve was never sent to them
      expect(rexApps).not.toMatch(/Eve Applicant|Admin score/);
      expect((await csv(admin, 'applications')).text).toMatch(/Admin score/);
      expect((await csv(cand.cara, 'applications')).text.split('\r\n')[0]).not.toContain('Candidate');
      expect((await csv(rex, 'jobs')).text.trim().split('\r\n')).toHaveLength(2);
      expect((await csv(ron, 'jobs')).text.trim().split('\r\n')).toHaveLength(1);
    });

    it('record who exported what, without the data itself', async () => {
      const log = (await admin.get('/api/audit-logs?entityType=Export&limit=50')).body.data;
      expect(log.length).toBeGreaterThanOrEqual(8);
      const pay = log.find((l: any) => l.action === 'DATA_EXPORTED' && l.metadata?.dataset === 'payments' && l.metadata?.format === 'xlsx');
      expect(pay).toMatchObject({ actorName: 'Admin', metadata: { rows: 2, period: 'all' } });
      expect(JSON.stringify(log)).not.toMatch(/UTR-|UPI-/);
    });
  });
});
