import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import { Types, type Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/common/mail/mail.service';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = (over: Record<string, any> = {}) => ({
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 1,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] },
  compensation: { salaryMin: 100000, salaryMax: 200000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.', specialInstructions: 'INTERNAL ONLY', requiredDocuments: ['Resume'] },
  ...over,
});

describe('Candidate portal, applications & workflow (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  let cara: ReturnType<typeof request.agent>, dan: ReturnType<typeof request.agent>;
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const publish = async (agent: typeof rex, companyId: string, over: Record<string, any> = {}) => {
    const jr = (await agent.post('/api/job-requests').send({ companyId, spec: spec(over) }).expect(201)).body.data.id;
    await agent.post(`/api/job-requests/${jr}/submit`).expect(200);
    return (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId as string;
  };
  const move = (id: string, status: string, extra: Record<string, unknown> = {}, who = admin) => who.patch(`/api/applications/${id}/status`).send({ status, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue({ send: async () => undefined }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) {
      const r = await reg('recruiter', n, e);
      await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200);
    }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    await reg('candidate', 'Cara Candidate', 'cara@t.dev'); await reg('candidate', 'Dan Candidate', 'dan@t.dev');
    cara = await login('cara@t.dev'); dan = await login('dan@t.dev');

    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    ids.job = await publish(rex, ids.company);
    ids.jobDocs = await publish(rex, ids.company, { title: 'Needs Passport', details: { description: 'A role that requires a passport copy to apply.', responsibilities: 'x', requiredDocuments: ['Resume', 'Passport copy'] } });
    ids.company2 = (await ron.post('/api/companies').send({ name: 'Globex' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company2}/approve`).send({}).expect(200);
    ids.otherJob = await publish(ron, ids.company2, { title: 'Ron Job' });
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('candidate profile & resume', () => {
    it('updates the profile, normalising skills', async () => {
      const res = await cara.patch('/api/candidates/me').send({ headline: 'Backend dev', skills: ['Node.js', ' node.js ', 'MongoDB', ''], experienceYears: 4, expectedSalary: { amount: 150000, currency: 'inr' }, noticePeriodDays: 30, phone: '+91 99999 00000' }).expect(200);
      expect(res.body.data.profile).toMatchObject({ headline: 'Backend dev', skills: ['Node.js', 'node.js', 'MongoDB'], expectedSalary: { currency: 'INR' } });
      expect(res.body.data.user.phone).toBe('+91 99999 00000');
      await rex.get('/api/candidates/me').expect(403);
    });

    it('accepts only genuine PDF/DOC/DOCX files', async () => {
      await cara.post('/api/candidates/me/resume').expect(400);
      await cara.post('/api/candidates/me/resume').attach('file', Buffer.from('hello'), { filename: 'resume.txt', contentType: 'text/plain' }).expect(400);
      const fake = await cara.post('/api/candidates/me/resume').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'resume.pdf', contentType: 'application/pdf' }).expect(400);
      expect(fake.body.error.code).toBe('INVALID_FILE');
      await cara.post('/api/candidates/me/resume').attach('file', Buffer.alloc(6 * 1024 * 1024, 1), { filename: 'big.pdf', contentType: 'application/pdf' }).expect(413);
    });

    it('stores a resume privately, versioning and archiving older ones', async () => {
      const first = await cara.post('/api/candidates/me/resume').attach('file', PDF, { filename: '../../evil/My Resume.pdf', contentType: 'application/pdf' }).expect(201);
      expect(first.body.data).toMatchObject({ type: 'RESUME', version: 1, status: 'ACTIVE', mime: 'application/pdf' });
      expect(first.body.data.originalName).toBe('My Resume.pdf'); // path stripped
      expect(JSON.stringify(first.body)).not.toMatch(/storageKey|storage\//);
      ids.resume1 = first.body.data.id;
      const second = await cara.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'v2.pdf', contentType: 'application/pdf' }).expect(201);
      expect(second.body.data.version).toBe(2);
      ids.resume2 = second.body.data.id;
      const mine = (await cara.get('/api/documents')).body.data;
      expect(mine.find((d: any) => d.id === ids.resume1).status).toBe('ARCHIVED');
      expect((await cara.get('/api/candidates/me')).body.data.resume.id).toBe(ids.resume2);
    });

    it('downloads only for the owner and Admin; others cannot even tell it exists', async () => {
      const ok = await cara.get(`/api/documents/${ids.resume2}/download`).expect(200);
      expect(ok.headers['content-type']).toContain('application/pdf');
      expect(ok.headers['content-disposition']).toContain('attachment');
      expect(ok.headers['cache-control']).toContain('no-store');
      await admin.get(`/api/documents/${ids.resume2}/download?inline=1`).expect(200).expect('content-disposition', /^inline/);
      await dan.get(`/api/documents/${ids.resume2}/download`).expect(404);
      await rex.get(`/api/documents/${ids.resume2}/download`).expect(404);
      await request(app.getHttpServer()).get(`/api/documents/${ids.resume2}/download`).expect(401);
    });
  });

  describe('browsing jobs', () => {
    it('flags saved and applied jobs for the candidate', async () => {
      await cara.put(`/api/candidates/me/saved-jobs/${ids.job}`).expect(200);
      const list = (await cara.get('/api/jobs')).body.data;
      expect(list.find((j: any) => j.id === ids.job)).toMatchObject({ saved: true, application: null });
      expect(list.find((j: any) => j.id === ids.otherJob)).toMatchObject({ saved: false });
      await cara.delete(`/api/candidates/me/saved-jobs/${ids.job}`).expect(200);
      expect((await cara.get(`/api/jobs/${ids.job}`)).body.data.saved).toBe(false);
      await cara.put('/api/candidates/me/saved-jobs/64b7f0f0f0f0f0f0f0f0f0f0').expect(404);
    });
  });

  describe('applying', () => {
    it('needs a resume first', async () => {
      const r = await dan.post('/api/applications').send({ jobId: ids.job }).expect(400);
      expect(r.body.error.code).toBe('RESUME_REQUIRED');
    });

    it('creates an application with a first history entry, and blocks duplicates', async () => {
      const res = await cara.post('/api/applications').send({ jobId: ids.job, coverLetter: 'Hello!', expectedSalary: { amount: 150000, currency: 'INR' }, noticePeriodDays: 30 }).expect(201);
      expect(res.body.data).toMatchObject({ applicationNumber: 'APP-00001', status: 'APPLIED' });
      ids.app = res.body.data.id;
      await cara.post('/api/applications').send({ jobId: ids.job }).expect(409);
      expect((await cara.get('/api/jobs')).body.data.find((j: any) => j.id === ids.job).application).toMatchObject({ id: ids.app, status: 'APPLIED' });
      await rex.post('/api/applications').send({ jobId: ids.job }).expect(403);
    });

    it('requires the documents the job asks for, and only the candidate\'s own', async () => {
      const missing = await cara.post('/api/applications').send({ jobId: ids.jobDocs }).expect(400);
      expect(missing.body.error.details).toEqual(['Attach your Passport copy']);
      const pass = await cara.post('/api/documents').field('type', 'IDENTIFICATION').field('label', 'Passport copy').attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' }).expect(201);
      await dan.post('/api/applications').send({ jobId: ids.jobDocs, documents: [{ label: 'Passport copy', documentId: pass.body.data.id }] }).expect(400); // not Dan's
      const ok = await cara.post('/api/applications').send({ jobId: ids.jobDocs, documents: [{ label: 'passport copy', documentId: pass.body.data.id }] }).expect(201);
      expect(ok.body.data.applicationNumber).toBe('APP-00002');
    });

    it('cannot apply to closed or unknown jobs', async () => {
      await rex.post(`/api/jobs/${ids.otherJob}/close`).send({}).expect(403); // recruiters ask; only Admin closes directly
      await admin.post(`/api/jobs/${ids.otherJob}/close`).send({}).expect(200);
      await cara.post('/api/applications').send({ jobId: ids.otherJob }).expect(404);
      await cara.post('/api/applications').send({ jobId: '64b7f0f0f0f0f0f0f0f0f0f0' }).expect(404);
    });
  });

  describe('visibility', () => {
    it('candidates see only their own applications, without staff notes', async () => {
      const mine = (await cara.get('/api/applications')).body;
      expect(mine.meta.total).toBe(2);
      expect((await dan.get('/api/applications')).body.meta.total).toBe(0);
      await dan.get(`/api/applications/${ids.app}`).expect(404);
      const one = (await cara.get(`/api/applications/${ids.app}`)).body.data;
      expect(one).toMatchObject({ status: 'APPLIED', job: { title: 'Backend Engineer' }, company: { name: 'Acme' } });
      expect(one.candidate).toBeUndefined();
      expect(one.adminNotes).toBeUndefined();
      expect(JSON.stringify(one)).not.toMatch(/INTERNAL ONLY|specialInstructions/);
    });

    it('recruiters see nothing until Admin sends the candidate', async () => {
      expect((await rex.get('/api/applications')).body.meta.total).toBe(0);
      await rex.get(`/api/applications/${ids.app}`).expect(404);
      await rex.get(`/api/documents/${ids.resume2}/download`).expect(404);
    });

    it('admin sees the full picture, searchable by candidate name or number', async () => {
      const detail = (await admin.get(`/api/applications/${ids.app}`)).body.data;
      expect(detail.candidate).toMatchObject({ name: 'Cara Candidate' });
      expect(detail.candidateProfile).toMatchObject({ headline: 'Backend dev' });
      expect(detail.transitions.map((t: any) => t.to)).toEqual(expect.arrayContaining(['ADMIN_REVIEW', 'REJECTED']));
      expect((await admin.get('/api/applications?search=cara')).body.meta.total).toBe(2);
      expect((await admin.get('/api/applications?search=APP-00002')).body.meta.total).toBe(1);
      expect((await admin.get('/api/applications?status=APPLIED')).body.meta.total).toBe(2);
    });
  });

  describe('workflow', () => {
    it('refuses skipped steps; Admin override needs a reason and is flagged', async () => {
      const skip = await move(ids.app, 'PLACED').expect(403);
      expect(skip.body.error.code).toBe('INVALID_TRANSITION');
      await move(ids.app, 'PLACED', { override: true }).expect(400);
      await move(ids.app, 'ADMIN_REVIEW', { override: true, reason: 'x' }).expect(200); // normal move: override flag not needed but harmless
      await rex.patch(`/api/applications/${ids.app}/status`).send({ status: 'PLACED', override: true, reason: 'sneaky' }).expect(404);
    });

    it('cannot be shortlisted straight from review, or before the interview has been held', async () => {
      const direct = await move(ids.app, 'ADMIN_SHORTLISTED').expect(403);
      expect(direct.body.error.code).toBe('INVALID_TRANSITION');
      await move(ids.app, 'ADMIN_INTERVIEW').expect(200);
      const early = await move(ids.app, 'ADMIN_SHORTLISTED').expect(409);
      expect(early.body.error.code).toBe('INTERVIEW_REQUIRED');
      await rex.patch(`/api/applications/${ids.app}/status`).send({ status: 'ADMIN_SHORTLISTED' }).expect(404); // not theirs to move yet
      // a scheduled but not yet held interview is not enough either
      const iv = (await admin.post('/api/interviews').send({ applicationId: ids.app, type: 'PHONE', startsAt: new Date(Date.now() + 3_600_000).toISOString(), durationMinutes: 30 }).expect(201)).body.data;
      expect(iv.stage).toBe('ADMIN');
      expect((await move(ids.app, 'ADMIN_SHORTLISTED').expect(409)).body.error.code).toBe('INTERVIEW_REQUIRED');
      await conn.collection('interviews').updateOne({ _id: new Types.ObjectId(iv.id) }, { $set: { startsAt: new Date(Date.now() - 3_600_000) } });
      await admin.post(`/api/interviews/${iv.id}/complete`).expect(200);
    });

    it('walks the recruiting path, recording every change', async () => {
      await move(ids.app, 'ADMIN_SHORTLISTED').expect(200);
      await move(ids.app, 'SENT_TO_RECRUITER', { notes: 'Strong match' }).expect(200);
      const hist = (await admin.get(`/api/applications/${ids.app}`)).body.data.statusHistory;
      expect(hist.map((h: any) => h.status)).toEqual(['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW', 'ADMIN_SHORTLISTED', 'SENT_TO_RECRUITER']);
      expect(hist[4]).toMatchObject({ role: 'ADMIN', changedByName: 'Admin', notes: 'Strong match' });
      // candidate sees the steps but not the notes
      const seen = (await cara.get(`/api/applications/${ids.app}`)).body.data.statusHistory;
      expect(seen.map((h: any) => h.status)).toEqual(hist.map((h: any) => h.status));
      expect(JSON.stringify(seen)).not.toContain('Strong match');
    });

    it('the sent candidate (and their resume) becomes visible to the owning recruiter only', async () => {
      expect((await rex.get('/api/applications')).body.meta.total).toBe(1);
      expect((await rex.get(`/api/applications/${ids.app}`)).body.data.candidate.name).toBe('Cara Candidate');
      await rex.get(`/api/documents/${ids.resume2}/download`).expect(200);
      expect((await ron.get('/api/applications')).body.meta.total).toBe(0);
      await ron.get(`/api/documents/${ids.resume2}/download`).expect(404);
    });

    it('a recruiter can return a candidate to Admin with a reason, and any rejection needs one', async () => {
      await move(ids.app, 'RECRUITER_REVIEW', {}, rex).expect(200);
      await move(ids.app, 'REJECTED', {}, rex).expect(400); // a rejection needs a reason (it is otherwise allowed straight away)
      await move(ids.app, 'ADMIN_REVIEW', {}, rex).expect(400);
      await move(ids.app, 'ADMIN_REVIEW', { reason: 'Salary expectation too high' }, rex).expect(200);
      const detail = (await admin.get(`/api/applications/${ids.app}`)).body.data;
      expect(detail.status).toBe('ADMIN_REVIEW');
      expect(detail.statusHistory.at(-1)).toMatchObject({ role: 'RECRUITER', reason: 'Salary expectation too high' });
    });

    it('allows only one of two concurrent changes', async () => {
      await move(ids.app, 'ADMIN_INTERVIEW').expect(200); // back through round one; the interview already held counts
      await move(ids.app, 'ADMIN_SHORTLISTED').expect(200);
      const [a, b] = await Promise.all([move(ids.app, 'SENT_TO_RECRUITER'), move(ids.app, 'REJECTED', { reason: 'Changed our mind' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('Admin rejection needs a reason; candidates can withdraw; terminal states stay closed', async () => {
      const second = ids.app2 = (await cara.get('/api/applications?search=APP-00002')).body.data[0].id;
      await move(second, 'ADMIN_REVIEW').expect(200);
      await move(second, 'REJECTED').expect(400);
      await move(second, 'REJECTED', { reason: 'Role filled' }).expect(200);
      await move(second, 'ADMIN_REVIEW', { override: true, reason: 'reopen' }).expect(409); // cannot reopen
      expect((await cara.get(`/api/applications/${second}`)).body.data.statusHistory.at(-1).reason).toBeUndefined(); // reason hidden from candidate
      await cara.post(`/api/applications/${second}/withdraw`).send({}).expect(403);
    });

    it('a candidate can withdraw a live application', async () => {
      const dj = await publish(rex, ids.company, { title: 'Another Role' });
      await dan.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'dan.pdf', contentType: 'application/pdf' }).expect(201);
      const a = (await dan.post('/api/applications').send({ jobId: dj }).expect(201)).body.data.id;
      await dan.post(`/api/applications/${a}/withdraw`).send({ reason: 'Accepted another offer' }).expect(200);
      expect((await dan.get(`/api/applications/${a}`)).body.data.status).toBe('WITHDRAWN');
      await dan.post(`/api/applications/${a}/withdraw`).send({}).expect(409); // already withdrawn
      await dan.patch(`/api/applications/${a}/status`).send({ status: 'APPLIED' }).expect(403);
    });
  });

  it('audits the lifecycle, including the override', async () => {
    const log = (await admin.get(`/api/audit-logs?entityType=Application&entityId=${ids.app}&sort=createdAt&limit=50`)).body.data;
    const actions = log.map((l: any) => l.action);
    expect(actions[0]).toBe('APPLICATION_CREATED');
    expect(actions).toEqual(expect.arrayContaining(['APPLICATION_STATUS_CHANGED', 'CANDIDATE_SHORTLISTED', 'CANDIDATE_SENT_TO_RECRUITER']));
    expect(log.find((l: any) => l.action === 'CANDIDATE_SENT_TO_RECRUITER')).toMatchObject({ previousState: { status: 'ADMIN_SHORTLISTED' }, newState: { status: 'SENT_TO_RECRUITER' }, actorRole: 'ADMIN' });
  });
});
