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
import { Contract } from './../src/contracts/schemas/contract.schema';
import { ContractVersion } from './../src/contracts/schemas/contract-version.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = {
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 3,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] }, compensation: { salaryMin: 50000000, salaryMax: 90000000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const terms = (over: Record<string, unknown> = {}) => ({ title: 'Backend Engineer', employmentType: 'FULL_TIME', salaryAmount: 70_000_000, currency: 'INR', salaryPeriod: 'YEAR', startDate: day(30), probationMonths: 3, noticePeriodDays: 60, ...over });

describe('Contracts, versions & commission (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let contractsM: Model<Contract>, versionsM: Model<ContractVersion>, emails: Model<Email>;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const notes = async (a: typeof admin) => (await a.get('/api/notifications?limit=100')).body.data;
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
  const appStatus = async (key: string) => (await admin.get(`/api/applications/${ids[key]}`)).body.data.status;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    contractsM = moduleRef.get(getModelToken(Contract.name)); versionsM = moduleRef.get(getModelToken(ContractVersion.name)); emails = moduleRef.get(getModelToken(Email.name));
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
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('creating a contract', () => {
    it('needs a selected candidate and the right person', async () => {
      await reg('candidate', 'Not Selected', 'ns@t.dev');
      cand.ns = await login('ns@t.dev');
      await cand.ns.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids.ns = (await cand.ns.post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
      const r = await admin.post('/api/contracts').send({ applicationId: ids.ns, ...terms() }).expect(409);
      expect(r.body.error.code).toBe('NOT_SELECTED');
      await cand.cara.post('/api/contracts').send({ applicationId: ids.cara, ...terms() }).expect(403);
      await ron.post('/api/contracts').send({ applicationId: ids.cara, ...terms() }).expect(404);
      await request(app.getHttpServer()).post('/api/contracts').send({}).expect(401);
    });

    it('validates the terms and refuses client-supplied money calculations', async () => {
      const bad = (over: Record<string, unknown>) => rex.post('/api/contracts').send({ applicationId: ids.cara, ...terms(over) }).expect(400);
      await bad({ salaryAmount: 1234.5 });
      await bad({ salaryAmount: 0 });
      await bad({ startDate: '15/11/2026' });
      await bad({ employmentType: 'CONTRACT' }); // fixed-term needs an end date
      await bad({ endDate: day(10) }); // before start
      await bad({ currency: 'RUPEES' });
      await bad({ commission: 99999, financials: { monthly: { commission: 1 } } }); // unknown fields are rejected, never trusted
    });

    it('a recruiter drafts it; commission is the platform default and the numbers come from the server', async () => {
      const r = await rex.post('/api/contracts').send({ applicationId: ids.cara, ...terms(), commissionPercent: 1 }).expect(201); // recruiter's commission input ignored
      ids.cCara = r.body.data.id;
      expect(r.body.data).toMatchObject({ contractNumber: 'CON-0001', status: 'DRAFT', currentVersion: 1, createdBy: { role: 'RECRUITER' } });
      // How the platform earns is Admin-only: the recruiter's own view carries no commission or split.
      expect(JSON.stringify(r.body.data)).not.toMatch(/commission|platformAmount|candidateAmount|financials|basisPoints/i);
      const a = (await admin.get(`/api/contracts/${ids.cCara}`)).body.data;
      expect(a.terms.commission).toEqual({ type: 'PERCENT', basisPoints: 1000 });
      expect(a.financials.monthly).toEqual({ grossAmount: 5_833_333, commission: 583_333, candidateAmount: 5_250_000, platformAmount: 583_333 });
      expect(a.financials.annual).toMatchObject({ grossAmount: 70_000_000, commission: 7_000_000 });
      expect(r.body.data.actions).toEqual(expect.arrayContaining(['edit', 'submit']));
      await rex.post('/api/contracts').send({ applicationId: ids.cara, ...terms() }).expect(409); // one per application
    });

    it('stays private until it is put to the candidate', async () => {
      await cand.cara.get(`/api/contracts/${ids.cCara}`).expect(404);
      expect((await cand.cara.get('/api/contracts')).body.meta.total).toBe(0);
      await ron.get(`/api/contracts/${ids.cCara}`).expect(404);
      expect((await admin.get('/api/contracts')).body.meta.total).toBe(1);
    });

    it('only the creator or Admin can edit the draft; only Admin can change commission', async () => {
      await ron.patch(`/api/contracts/${ids.cCara}`).send({ notes: 'x' }).expect(404);
      await rex.patch(`/api/contracts/${ids.cCara}`).send({ workingHours: '40h/week', commissionPercent: 50 }).expect(200);
      expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data.terms).toMatchObject({ workingHours: '40h/week', commission: { basisPoints: 1000 } });
      const r = await admin.patch(`/api/contracts/${ids.cCara}`).send({ commissionPercent: 12.5 }).expect(200);
      expect(r.body.data.financials.monthly).toEqual({ grossAmount: 5_833_333, commission: 729_167, candidateAmount: 5_104_166, platformAmount: 729_167 });
    });
  });

  describe('approval chain (recruiter-created: Admin, then candidate)', () => {
    it('only the party whose turn it is can approve', async () => {
      await cand.cara.post(`/api/contracts/${ids.cCara}/submit`).expect(403);
      const sub = await rex.post(`/api/contracts/${ids.cCara}/submit`).expect(200);
      expect(sub.body.data.status).toBe('PENDING_ADMIN_APPROVAL');
      await rex.post(`/api/contracts/${ids.cCara}/submit`).expect(409);
      await rex.patch(`/api/contracts/${ids.cCara}`).send({ notes: 'late edit' }).expect(409); // locked once submitted
      const r = await rex.post(`/api/contracts/${ids.cCara}/approve`).send({}).expect(403);
      expect(r.body.error.code).toBe('NOT_YOUR_TURN');
      await cand.cara.post(`/api/contracts/${ids.cCara}/approve`).send({}).expect(404);
      expect((await admin.get('/api/notifications')).body.data.some((n: any) => n.title.startsWith('Contract to review: CON-0001'))).toBe(true);
    });

    it('Admin approval puts it to the candidate and moves the application to CONTRACT', async () => {
      expect(await appStatus('cara')).toBe('SELECTED');
      const approvals = (await admin.get('/api/approvals?category=CONTRACT_APPROVAL')).body.data;
      expect(approvals).toHaveLength(1);
      expect(approvals[0]).toMatchObject({ entityId: ids.cCara, actions: ['approve', 'reject', 'request-changes'] });

      const r = await admin.post(`/api/contracts/${ids.cCara}/approve`).send({ note: 'Looks right' }).expect(200);
      expect(r.body.data.status).toBe('PENDING_CANDIDATE_APPROVAL');
      expect(await appStatus('cara')).toBe('CONTRACT');
      expect((await admin.get('/api/approvals?category=CONTRACT_APPROVAL')).body.data).toHaveLength(0);

      const mail = await emails.findOne({ to: 'cara@t.dev', template: 'contract-created' }).select('+html').lean();
      expect(mail!.html).toContain('Backend Engineer');
      expect(mail!.html).toContain('Acme');
      expect(mail!.html).toMatch(/₹6,12,500\.00 \/ year|₹612,500\.00 \/ year/); // the candidate's own figure, after the platform's share
      expect(mail!.html).not.toMatch(/7,00,000|700,000/);
      expect((await notes(cand.cara)).some((n: any) => n.title === 'Your contract is ready: Backend Engineer')).toBe(true);
    });

    it('the candidate sees salary and terms but never commission or platform earnings', async () => {
      const r = (await cand.cara.get(`/api/contracts/${ids.cCara}`).expect(200)).body.data;
      expect(r.terms).toMatchObject({ salary: { amount: 61_250_000, currency: 'INR', period: 'YEAR' }, noticePeriodDays: 60 }); // what the candidate receives: 70,000,000 less the 12.5% the platform keeps, which they are never told
      expect(JSON.stringify(r)).not.toMatch(/commission|platformAmount|candidateAmount|financials|basisPoints|recruiter/i);
      expect(r.actions).toEqual(['approve', 'reject']);
      expect((await cand.cara.get('/api/contracts')).body.data[0]).toMatchObject({ contractNumber: 'CON-0001', status: 'PENDING_CANDIDATE_APPROVAL' });
      // recruiters never see the commission either; only Admin does
      expect(JSON.stringify((await rex.get(`/api/contracts/${ids.cCara}`)).body.data)).not.toMatch(/commission|platformAmount|financials|basisPoints/i);
      expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data.financials.monthly.commission).toBe(729_167);
    });

    it('declining returns it to draft with the reason, and tells the creator', async () => {
      await cand.cara.post(`/api/contracts/${ids.cCara}/reject`).send({}).expect(400);
      await cand.cara.post(`/api/contracts/${ids.cCara}/reject`).send({ reason: 'Notice period is too long' }).expect(200);
      const r = (await rex.get(`/api/contracts/${ids.cCara}`)).body.data;
      expect(r).toMatchObject({ status: 'DRAFT', lastDecline: { role: 'CANDIDATE', reason: 'Notice period is too long' } });
      expect((await notes(rex)).some((n: any) => n.title === 'Contract sent back: Cara Candidate')).toBe(true);
      await cand.cara.get(`/api/contracts/${ids.cCara}`).expect(404); // hidden again while it is being reworked
      await rex.patch(`/api/contracts/${ids.cCara}`).send({ noticePeriodDays: 30 }).expect(200);
      await rex.post(`/api/contracts/${ids.cCara}/submit`).expect(200);
      await admin.post(`/api/contracts/${ids.cCara}/approve`).send({}).expect(200);
    });

    it('acceptance activates the contract and places the candidate', async () => {
      const r = await cand.cara.post(`/api/contracts/${ids.cCara}/approve`).send({}).expect(200);
      expect(r.body.data.status).toBe('ACTIVE');
      expect(await appStatus('cara')).toBe('PLACED');
      const v1 = await versionsM.findOne({ contractId: ids.cCara, version: 1 }).lean();
      expect(v1).toMatchObject({ status: 'APPROVED', decidedByName: 'Cara Candidate' });
      expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data.statusHistory.map((h: any) => h.status)).toEqual(['DRAFT', 'PENDING_ADMIN_APPROVAL', 'PENDING_CANDIDATE_APPROVAL', 'DRAFT', 'PENDING_ADMIN_APPROVAL', 'PENDING_CANDIDATE_APPROVAL', 'ACTIVE']);
      await cand.cara.post(`/api/contracts/${ids.cCara}/approve`).send({}).expect(403); // nothing left to approve
      await rex.patch(`/api/contracts/${ids.cCara}`).send({ notes: 'edit active' }).expect(409);
    });
  });

  describe('approval chain (Admin-created: recruiter, then candidate)', () => {
    it('runs the other way round', async () => {
      await selected('dan', 'Dan Candidate');
      const r = await admin.post('/api/contracts').send({ applicationId: ids.dan, ...terms({ salaryAmount: 5_000_000, salaryPeriod: 'MONTH', commissionPercent: 10 }) }).expect(201);
      ids.cDan = r.body.data.id;
      expect(r.body.data.financials.monthly).toEqual({ grossAmount: 5_000_000, commission: 500_000, candidateAmount: 4_500_000, platformAmount: 500_000 });
      await admin.post(`/api/contracts/${ids.cDan}/submit`).expect(200);
      expect((await admin.get(`/api/contracts/${ids.cDan}`)).body.data.status).toBe('PENDING_RECRUITER_APPROVAL');
      expect(await appStatus('dan')).toBe('CONTRACT');
      await admin.post(`/api/contracts/${ids.cDan}/approve`).send({}).expect(403); // Admin already approved by creating it
      await ron.post(`/api/contracts/${ids.cDan}/approve`).send({}).expect(404);
      await rex.post(`/api/contracts/${ids.cDan}/approve`).send({}).expect(200);
      expect((await admin.get(`/api/contracts/${ids.cDan}`)).body.data.status).toBe('PENDING_CANDIDATE_APPROVAL');
      await cand.dan.post(`/api/contracts/${ids.cDan}/approve`).send({}).expect(200);
      expect((await admin.get(`/api/contracts/${ids.cDan}`)).body.data.status).toBe('ACTIVE');
    });
  });

  describe('versioned changes', () => {
    it('a recruiter change creates version 2 and leaves the current terms untouched', async () => {
      await cand.cara.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 1, reason: 'x y z' }).expect(403);
      await ron.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 84_000_000, reason: 'Promotion' }).expect(404);
      await rex.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 84_000_000 }).expect(400); // reason required
      await rex.post(`/api/contracts/${ids.cCara}/versions`).send({ reason: 'No change really' }).expect(400);
      const r = await rex.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 84_000_000, commissionPercent: 1, reason: 'Promotion to senior' }).expect(201);

      expect(r.body.data.currentVersion).toBe(1);
      expect(r.body.data.terms.salary.amount).toBe(70_000_000); // still in force
      expect(r.body.data.pendingChange).toMatchObject({ version: 2, status: 'PENDING', reason: 'Promotion to senior', terms: { salary: { amount: 84_000_000 } } });
      expect(r.body.data.pendingChange.changes).toEqual([{ field: 'salary.amount', label: 'Salary', from: 70_000_000, to: 84_000_000 }]); // commission change was ignored
      expect(r.body.data.actions).not.toContain('change');
      await rex.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 90_000_000, reason: 'Another' }).expect(409);

      const item = (await admin.get('/api/approvals?category=CONTRACT_CHANGE')).body.data[0];
      expect(item).toMatchObject({ entityId: ids.cCara, tags: ['v2'], actions: ['approve', 'reject', 'request-changes'] });
      expect((await cand.cara.get(`/api/contracts/${ids.cCara}`)).body.data.versions).toHaveLength(1); // candidates never see pending changes
    });

    it('Admin can send it back; the recruiter revises and the old request is superseded', async () => {
      await admin.post(`/api/contracts/${ids.cCara}/versions/2/request-changes`).send({}).expect(400);
      await admin.post(`/api/contracts/${ids.cCara}/versions/2/request-changes`).send({ reason: 'Split into base and bonus' }).expect(200);
      expect(await versionsM.findOne({ contractId: ids.cCara, version: 2 }).lean()).toMatchObject({ status: 'CHANGES_REQUESTED', decisionNote: 'Split into base and bonus' });
      expect((await notes(rex)).some((n: any) => n.title.startsWith('Contract change sent back for changes: CON-0001'))).toBe(true);
      await admin.post(`/api/contracts/${ids.cCara}/versions/2/approve`).send({}).expect(409); // no longer pending

      await rex.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 84_000_000, reason: 'Revised: promotion with bonus split' }).expect(201);
      expect((await versionsM.find({ contractId: ids.cCara }).sort({ version: 1 }).lean()).map((v) => `${v.version}:${v.status}`)).toEqual(['1:APPROVED', '2:SUPERSEDED', '3:PENDING']);
    });

    it('approval makes version 3 current, recalculates the money, and keeps version 1 exactly as it was', async () => {
      const before = await versionsM.findOne({ contractId: ids.cCara, version: 1 }).lean();
      const r = await admin.post(`/api/approvals/CONTRACT_CHANGE/${ids.cCara}/approve`).send({ note: 'Approved' }).expect(200);
      expect(r.body.data).toBeDefined();
      const c = (await admin.get(`/api/contracts/${ids.cCara}`)).body.data;
      expect(c).toMatchObject({ currentVersion: 3, status: 'ACTIVE' });
      expect(c.terms.salary.amount).toBe(84_000_000);
      expect(c.financials.monthly).toEqual({ grossAmount: 7_000_000, commission: 875_000, candidateAmount: 6_125_000, platformAmount: 875_000 }); // 12.5% carried over, recalculated
      expect(c.versions.map((v: any) => [v.version, v.status, v.current])).toEqual([[1, 'APPROVED', false], [2, 'SUPERSEDED', false], [3, 'APPROVED', true]]);
      expect(c.versions[0].financials.monthly.commission).toBe(729_167); // history intact

      const after = await versionsM.findOne({ contractId: ids.cCara, version: 1 }).lean();
      expect(after).toEqual(before);

      // everyone affected is told
      const mail = await emails.findOne({ to: 'cara@t.dev', template: 'contract-updated' }).select('+html').lean();
      expect(mail!.html).toMatch(/7,35,000|735,000/);
      expect(mail!.html).not.toMatch(/8,40,000|840,000/);
      expect((await notes(rex)).some((n: any) => n.title === 'Contract updated: Backend Engineer')).toBe(true);
      const cv = (await cand.cara.get(`/api/contracts/${ids.cCara}`)).body.data;
      expect(cv.versions.map((v: any) => v.version)).toEqual([1, 3]); // candidate sees only versions that took effect
      expect(JSON.stringify(cv)).not.toMatch(/commission|financials/i);
    });

    it('Admin\'s own change takes effect immediately as the next version number', async () => {
      const r = await admin.post(`/api/contracts/${ids.cDan}/versions`).send({ salaryAmount: 6_000_000, reason: 'Annual review' }).expect(201);
      expect(r.body.data).toMatchObject({ currentVersion: 2, pendingChange: null });
      expect(r.body.data.financials.monthly).toMatchObject({ grossAmount: 6_000_000, commission: 600_000, candidateAmount: 5_400_000 });
      expect((await versionsM.findOne({ contractId: ids.cDan, version: 1 }).lean())!.terms.salary.amount).toBe(5_000_000);
    });

    it('the audit log carries the previous and new money values', async () => {
      const log = (await admin.get(`/api/audit-logs?entityType=Contract&entityId=${ids.cCara}&limit=50`)).body.data;
      const upd = log.find((l: any) => l.action === 'CONTRACT_UPDATED');
      expect(upd.previousState.monthly.commission).toBe(729_167);
      expect(upd.newState.monthly.commission).toBe(875_000);
      expect(log.map((l: any) => l.action)).toEqual(expect.arrayContaining(['CONTRACT_CREATED', 'CONTRACT_SUBMITTED', 'CONTRACT_APPROVED', 'CONTRACT_DECLINED', 'CONTRACT_ACTIVATED', 'CONTRACT_CHANGE_REQUESTED', 'CONTRACT_CHANGE_DECIDED']));
    });
  });

  describe('lists, counts and scoping', () => {
    it('scopes lists by role and filters by status', async () => {
      expect((await admin.get('/api/contracts?status=ACTIVE')).body.meta.total).toBe(2);
      expect((await rex.get('/api/contracts')).body.meta.total).toBe(2);
      expect((await ron.get('/api/contracts')).body.meta.total).toBe(0);
      expect((await cand.dan.get('/api/contracts')).body.data.map((c: any) => c.contractNumber)).toEqual(['CON-0002']);
      expect((await admin.get('/api/contracts?statuses=ACTIVE,EXPIRING')).body.meta.total).toBe(2);
      await admin.get('/api/contracts?status=NOPE').expect(400);
      const counts = (await admin.get('/api/contracts/counts')).body.data;
      expect(counts).toMatchObject({ ACTIVE: 2, pendingTotal: 0, pendingChanges: 0 });
    });
  });

  describe('expiry tracking', () => {
    it('flags contracts nearing their end, then expired ones; extending returns them to active', async () => {
      await admin.post('/api/contracts/lifecycle/run').expect(200);
      await rex.post('/api/contracts/lifecycle/run').expect(403);
      // Admin sets an end date three weeks away
      await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ startDate: day(-5), endDate: day(21), reason: 'Fixed end for the project' }).expect(201);
      expect((await admin.get('/api/contracts?endingWithinDays=30')).body.data.map((c: any) => c.contractNumber)).toEqual(['CON-0001']);
      expect((await admin.post('/api/contracts/lifecycle/run').expect(200)).body.data).toEqual({ expiring: 1, expired: 0 });
      expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data).toMatchObject({ status: 'EXPIRING' });
      expect((await admin.post('/api/contracts/lifecycle/run')).body.data).toEqual({ expiring: 0, expired: 0 }); // not warned twice
      for (const a of [admin, rex, cand.cara]) expect((await notes(a)).some((n: any) => /^Contract ending in \d+ days: CON-0001/.test(n.title))).toBe(true);
      expect((await admin.get('/api/contracts/counts')).body.data.expiringSoon).toBeGreaterThanOrEqual(1);

      // renewal: pushing the end date out puts it back to ACTIVE
      const r = await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ endDate: day(400), reason: 'Renewed for a year' }).expect(201);
      expect(r.body.data.status).toBe('ACTIVE');

      // time passes: end date in the past
      await contractsM.updateOne({ _id: ids.cCara }, { endDate: day(-2) });
      expect((await admin.post('/api/contracts/lifecycle/run')).body.data).toEqual({ expiring: 0, expired: 1 });
      expect((await admin.get(`/api/contracts/${ids.cCara}`)).body.data.status).toBe('EXPIRED');
      await admin.post(`/api/contracts/${ids.cCara}/versions`).send({ salaryAmount: 1_000_000, reason: 'too late' }).expect(409);
      expect((await notes(admin)).some((n: any) => n.title === 'Contract expired: CON-0001')).toBe(true);
    });
  });

  describe('termination', () => {
    it('is Admin-only, needs a reason, and ends the contract', async () => {
      await rex.post(`/api/contracts/${ids.cDan}/terminate`).send({ reason: 'x' }).expect(403);
      await admin.post(`/api/contracts/${ids.cDan}/terminate`).send({}).expect(400);
      await admin.post(`/api/contracts/${ids.cDan}/terminate`).send({ reason: 'Candidate resigned' }).expect(200);
      expect((await admin.get(`/api/contracts/${ids.cDan}`)).body.data).toMatchObject({ status: 'TERMINATED', terminationReason: 'Candidate resigned' });
      await admin.post(`/api/contracts/${ids.cDan}/terminate`).send({ reason: 'again' }).expect(409);
      expect((await notes(cand.dan)).some((n: any) => n.title === 'Contract terminated: CON-0002')).toBe(true);
    });
  });

  it('feeds the dashboards', async () => {
    const o = (await admin.get('/api/analytics/admin/overview')).body.data;
    expect(o.totals.activeContracts).toBe(0);
    expect(o.attention).toMatchObject({ contractApprovals: 0, contractChanges: 0 });
  });
});
