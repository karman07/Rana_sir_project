import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/common/mail/mail.service';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';

const fullSpec = (over: Record<string, any> = {}) => ({
  title: 'Senior Backend Engineer', department: 'Engineering', location: 'Bengaluru', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 2,
  requirements: { experienceMin: 5, technicalSkills: ['Node.js', 'MongoDB'], softSkills: ['Communication'] },
  compensation: { salaryMin: 3000000000, salaryMax: 4500000000, currency: 'INR', benefits: ['Health insurance'] },
  contract: { probationMonths: 3, noticePeriodDays: 60 },
  details: { description: 'Build and own the services behind our hiring platform.', responsibilities: 'Design APIs, review code, mentor juniors.', specialInstructions: 'INTERNAL: client wants referrals only' },
  ...over,
});

describe('Companies, job requests & jobs (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>;
  let rex: ReturnType<typeof request.agent>;
  let ron: ReturnType<typeof request.agent>;
  let cara: ReturnType<typeof request.agent>;
  let companyId: string;
  let requestId: string;
  let jobId: string;

  const login = async (email: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/login').send({ email, password: PW }).expect(200);
    return a;
  };
  const register = async (kind: 'recruiter' | 'candidate', name: string, email: string) =>
    request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async () => undefined }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');

    const r1 = await register('recruiter', 'Rex Agent', 'rex@t.dev');
    const r2 = await register('recruiter', 'Ron Agent', 'ron@t.dev');
    await admin.post(`/api/recruiters/${r1.body.data.user.id}/approve`).send({}).expect(200);
    await admin.post(`/api/recruiters/${r2.body.data.user.id}/approve`).send({}).expect(200);
    await register('candidate', 'Cara', 'cara@t.dev');
    rex = await login('rex@t.dev');
    ron = await login('ron@t.dev');
    cara = await login('cara@t.dev');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  describe('companies', () => {
    it('a recruiter can only post for companies Admin has approved for them', async () => {
      const created = await rex.post('/api/companies').send({ name: 'Northwind Labs', industry: 'Software', location: 'Bengaluru' }).expect(201);
      companyId = created.body.data.id;
      expect(created.body.data).toMatchObject({ approvalStatus: 'PENDING_REVIEW', linkStatus: 'PENDING_REVIEW' });
      await rex.post('/api/companies').send({ name: 'northwind labs' }).expect(409); // duplicate, case-insensitive

      const blocked = await rex.post('/api/job-requests').send({ companyId, spec: { title: 'X Role' } }).expect(403);
      expect(blocked.body.error.code).toBe('COMPANY_NOT_AUTHORISED');
      expect((await rex.get('/api/companies/mine/usable')).body.data).toEqual([]);

      await rex.post(`/api/companies/${companyId}/approve`).expect(403); // admin only
      await admin.post(`/api/companies/${companyId}/reject`).send({}).expect(400);
      await admin.post(`/api/companies/${companyId}/approve`).send({}).expect(200);
      expect((await rex.get('/api/companies/mine/usable')).body.data.map((c: any) => c.name)).toEqual(['Northwind Labs']);
    });

    it('other recruiters do not see the company until they are linked', async () => {
      expect((await ron.get('/api/companies')).body.meta.total).toBe(0);
      await ron.post(`/api/companies/${companyId}/request-link`).expect(200);
      await ron.post(`/api/companies/${companyId}/request-link`).expect(409);
      expect((await ron.get('/api/companies')).body.data[0]).toMatchObject({ linkStatus: 'PENDING_REVIEW' });
      await ron.post('/api/job-requests').send({ companyId }).expect(403); // link not yet approved
    });
  });

  describe('job request lifecycle', () => {
    it('saves partial drafts but refuses incomplete submissions', async () => {
      const res = await rex.post('/api/job-requests').send({ companyId, spec: { title: 'Senior Backend Engineer' } }).expect(201);
      requestId = res.body.data.id;
      expect(res.body.data).toMatchObject({ status: 'DRAFT', version: 0, requestNumber: 'JR-0001' });

      const bad = await rex.post(`/api/job-requests/${requestId}/submit`).expect(400);
      expect(bad.body.error.details).toEqual(expect.arrayContaining(['Location is required', 'Add at least one technical skill']));

      const patched = await rex.patch(`/api/job-requests/${requestId}`).send({ spec: fullSpec() }).expect(200);
      expect(patched.body.data.spec.requirements.technicalSkills).toEqual(['Node.js', 'MongoDB']);
      // partial patch merges into groups instead of wiping them
      const merged = await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { compensation: { bonus: '10% annual' } } }).expect(200);
      expect(merged.body.data.spec.compensation).toMatchObject({ bonus: '10% annual', salaryMin: 3000000000, currency: 'INR' });
    });

    it('validates money and ranges', async () => {
      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { compensation: { salaryMin: 10.5 } } }).expect(400); // must be integer minor units
      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { compensation: { salaryMin: 9000000000 } } }).expect(200);
      const bad = await rex.post(`/api/job-requests/${requestId}/submit`).expect(400);
      expect(bad.body.error.details).toContain('Maximum salary cannot be below the minimum');
      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { compensation: { salaryMin: 3000000000 } } }).expect(200);
    });

    it('is private to its recruiter and invisible to admin until submitted', async () => {
      await ron.get(`/api/job-requests/${requestId}`).expect(404);
      await ron.patch(`/api/job-requests/${requestId}`).send({ spec: { title: 'Hijack' } }).expect(404);
      await admin.get(`/api/job-requests/${requestId}`).expect(404);
      expect((await admin.get('/api/job-requests')).body.meta.total).toBe(0);
      await cara.get('/api/job-requests').expect(403);
    });

    it('submits for review and locks editing', async () => {
      const res = await rex.post(`/api/job-requests/${requestId}/submit`).expect(200);
      expect(res.body.data).toMatchObject({ status: 'PENDING_ADMIN_REVIEW', version: 1 });
      await rex.post(`/api/job-requests/${requestId}/submit`).expect(409);
      await rex.delete(`/api/job-requests/${requestId}`).expect(409);

      const queue = await admin.get('/api/job-requests?status=PENDING_ADMIN_REVIEW').expect(200);
      expect(queue.body.data[0]).toMatchObject({ requestNumber: 'JR-0001', company: { name: 'Northwind Labs' }, recruiter: { name: 'Rex Agent' } });
      expect((await admin.get('/api/job-requests/counts')).body.data).toMatchObject({ PENDING_ADMIN_REVIEW: 1 });
      const overview = (await admin.get('/api/analytics/admin/overview')).body.data;
      expect(overview.attention.pendingJobRequests).toBe(1);
      expect(overview.queue[0]).toMatchObject({ type: 'JOB_REQUEST', title: 'Senior Backend Engineer', id: requestId });
      const mine = (await rex.get('/api/analytics/recruiter/overview')).body.data;
      expect(mine.openings).toMatchObject({ inReview: 1, live: 0 });
    });

    it('nothing is visible to candidates before approval', async () => {
      expect((await cara.get('/api/jobs')).body.meta.total).toBe(0);
    });

    it('admin requests changes; recruiter edits and resubmits', async () => {
      await admin.post(`/api/job-requests/${requestId}/request-changes`).send({}).expect(400);
      await admin.post(`/api/job-requests/${requestId}/request-changes`).send({ note: 'Please clarify the salary band' }).expect(200);
      await admin.post(`/api/job-requests/${requestId}/approve`).send({}).expect(409); // no longer pending

      const seen = await rex.get(`/api/job-requests/${requestId}`).expect(200);
      expect(seen.body.data.status).toBe('CHANGES_REQUESTED');
      expect(seen.body.data.reviews.at(-1)).toMatchObject({ action: 'CHANGES_REQUESTED', note: 'Please clarify the salary band', byName: 'Admin' });

      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { compensation: { salaryMax: 4000000000 } } }).expect(200);
      const again = await rex.post(`/api/job-requests/${requestId}/submit`).expect(200);
      expect(again.body.data.version).toBe(2);

      const detail = await admin.get(`/api/job-requests/${requestId}`).expect(200);
      expect(detail.body.data.revisions).toHaveLength(2);
      expect(detail.body.data.revisions[0].spec.compensation.salaryMax).toBe(4500000000);
      expect(detail.body.data.revisions[1].spec.compensation.salaryMax).toBe(4000000000);
      expect(detail.body.data.reviews.map((r: any) => r.action)).toEqual(['SUBMITTED', 'CHANGES_REQUESTED', 'RESUBMITTED']);
    });

    it('approval creates a published job; a request can only be approved once', async () => {
      const res = await admin.post(`/api/job-requests/${requestId}/approve`).send({ note: 'Good to go', commission: { type: 'PERCENT', percent: 10 } }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'APPROVED', jobNumber: 'JOB-1001' });
      jobId = res.body.data.jobId;
      await admin.post(`/api/job-requests/${requestId}/approve`).send({}).expect(409);
      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { title: 'Changed' } }).expect(409);
    });
  });

  describe('public jobs', () => {
    it('candidates see the job without internal fields', async () => {
      const list = await cara.get('/api/jobs').expect(200);
      expect(list.body.meta.total).toBe(1);
      const job = list.body.data[0];
      expect(job).toMatchObject({ jobNumber: 'JOB-1001', status: 'PUBLISHED', company: { name: 'Northwind Labs' } });
      expect(JSON.stringify(job)).not.toMatch(/specialInstructions|INTERNAL|recruiterId|approvedBy|rex@t\.dev/);
      const one = await cara.get(`/api/jobs/${jobId}`).expect(200);
      expect(one.body.data.spec.details.description).toContain('hiring platform');
    });

    it('supports search and filters', async () => {
      const q = async (qs: string) => (await cara.get(`/api/jobs?${qs}`).expect(200)).body.meta.total;
      expect(await q('search=backend')).toBe(1);
      expect(await q('search=zzz')).toBe(0);
      expect(await q('location=bengal')).toBe(1);
      expect(await q('location=london')).toBe(0);
      expect(await q('skill=mongo')).toBe(1);
      expect(await q('workMode=REMOTE')).toBe(0);
      expect(await q('employmentType=FULL_TIME')).toBe(1);
      expect(await q('maxExperience=3')).toBe(0);
      expect(await q('maxExperience=6')).toBe(1);
      expect(await q('minSalary=3500000000&currency=INR')).toBe(1);
      expect(await q('minSalary=5000000000&currency=INR')).toBe(0);
      expect(await q('minSalary=1&currency=USD')).toBe(0);
    });

    it('candidates cannot widen visibility with a status filter, and recruiters only see their own', async () => {
      expect((await cara.get('/api/jobs?status=CLOSED')).body.meta.total).toBe(1); // ignored: still only PUBLISHED
      expect((await rex.get('/api/jobs')).body.meta.total).toBe(1);
      expect((await ron.get('/api/jobs')).body.meta.total).toBe(0);
      await ron.get(`/api/jobs/${jobId}`).expect(404);
    });

    it('recruiters cannot edit or close a live job themselves: they ask, and Admin decides', async () => {
      await rex.post(`/api/jobs/${jobId}/close`).send({ reason: 'Filled internally' }).expect(403);
      await rex.patch(`/api/job-requests/${requestId}`).send({ spec: { title: 'Sneaky edit' } }).expect(409);
      await cara.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Not mine' }).expect(403);
      await ron.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Not mine' }).expect(404);

      // validation
      await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'EDIT', reason: 'Raise the pay' }).expect(400); // no spec
      const same = await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'EDIT', reason: 'Nothing really', spec: { title: 'Senior Backend Engineer' } }).expect(400);
      expect(same.body.error.code).toBe('NO_CHANGES');

      // an edit: waits, then Admin approves and the live job changes
      const edit = (await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'EDIT', reason: 'Budget approved for more', spec: { title: 'Staff Backend Engineer', compensation: { salaryMax: 5000000000 } } }).expect(201)).body.data;
      expect(edit).toMatchObject({ changeNumber: 'JCR-0001', type: 'EDIT', status: 'PENDING', actions: ['cancel'] });
      expect(edit.changes.map((c: any) => c.label).sort()).toEqual(['Pay to', 'Title']);
      expect((await cara.get(`/api/jobs/${jobId}`)).body.data.spec.title).toBe('Senior Backend Engineer'); // unchanged until approved
      const dup = await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Also close it' }).expect(409);
      expect(dup.body.error.code).toBe('CHANGE_PENDING');
      await ron.get(`/api/job-changes/${edit.id}`).expect(404);
      expect((await admin.get('/api/approvals/summary')).body.data.byCategory.JOB_CHANGE).toBe(1);
      await rex.post(`/api/job-changes/${edit.id}/approve`).send({}).expect(403);
      await admin.post(`/api/job-changes/${edit.id}/approve`).send({ note: 'Fine' }).expect(200);
      await admin.post(`/api/job-changes/${edit.id}/approve`).send({}).expect(409);
      expect((await cara.get(`/api/jobs/${jobId}`)).body.data.spec).toMatchObject({ title: 'Staff Backend Engineer' });
      const mine = (await rex.get(`/api/job-requests/${requestId}`)).body.data;
      expect(mine.spec.title).toBe('Staff Backend Engineer');

      // a withdrawn request, then a declined one
      const w = (await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Changed my mind soon' }).expect(201)).body.data;
      expect((await rex.post(`/api/job-changes/${w.id}/cancel`).send({}).expect(200)).body.data.status).toBe('CANCELLED');
      const no = (await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Close please' }).expect(201)).body.data;
      await admin.post(`/api/job-changes/${no.id}/reject`).send({}).expect(400); // a reason is needed
      expect((await admin.post(`/api/job-changes/${no.id}/reject`).send({ note: 'Still hiring' }).expect(200)).body.data).toMatchObject({ status: 'REJECTED', decisionNote: 'Still hiring' });
      expect((await cara.get('/api/jobs')).body.meta.total).toBe(1);

      // a closure: approving it ends the opening
      const close = (await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Filled internally' }).expect(201)).body.data;
      expect((await admin.get(`/api/job-changes/${close.id}`)).body.data).toMatchObject({ liveApplications: 0, actions: ['approve', 'reject'] });
      expect((await rex.get('/api/job-changes?status=PENDING')).body.meta.total).toBe(1);
      await admin.post(`/api/job-changes/${close.id}/approve`).send({}).expect(200);
      expect((await cara.get('/api/jobs')).body.meta.total).toBe(0);
      await cara.get(`/api/jobs/${jobId}`).expect(404);
      expect((await admin.get('/api/jobs?status=CLOSED')).body.meta.total).toBe(1);
      const late = await rex.post(`/api/jobs/${jobId}/change-requests`).send({ type: 'CLOSE', reason: 'Again?' }).expect(409);
      expect(late.body.error.code).toBe('NOT_LIVE');
      expect((await rex.get('/api/job-changes')).body.meta.total).toBe(4);
      expect(await conn.collection('auditlogs').countDocuments({ action: 'JOB_CHANGE_DECIDED' })).toBeGreaterThanOrEqual(3);
    });
  });

  describe('other outcomes', () => {
    it('a recruiter can edit a request while it waits; it goes back for review as a new version', async () => {
      const r = await rex.post('/api/job-requests').send({ companyId, spec: fullSpec({ title: 'Waiting Role' }) }).expect(201);
      await rex.post(`/api/job-requests/${r.body.data.id}/submit`).expect(200);
      const edited = await rex.patch(`/api/job-requests/${r.body.data.id}`).send({ spec: { title: 'Waiting Role (updated)' } }).expect(200);
      expect(edited.body.data).toMatchObject({ status: 'PENDING_ADMIN_REVIEW', version: 2 });
      await ron.patch(`/api/job-requests/${r.body.data.id}`).send({ spec: { title: 'Hijack' } }).expect(404);
      await rex.patch(`/api/job-requests/${r.body.data.id}`).send({ spec: { title: 'x' } }).expect(400); // still has to be a complete opening
      const detail = (await admin.get(`/api/job-requests/${r.body.data.id}`).expect(200)).body.data;
      expect(detail.revisions).toHaveLength(2);
      expect(detail.reviews.map((x: any) => x.action)).toEqual(['SUBMITTED', 'RESUBMITTED']);
    });

    let second: string;
    it('approve without publishing keeps the job hidden until Admin publishes it', async () => {
      const r = await rex.post('/api/job-requests').send({ companyId, spec: fullSpec({ title: 'Platform Engineer' }) }).expect(201);
      second = r.body.data.id;
      await rex.post(`/api/job-requests/${second}/submit`).expect(200);
      const ok = await admin.post(`/api/job-requests/${second}/approve`).send({ publish: false, commission: { type: 'PERCENT', percent: 10 } }).expect(200);
      expect(ok.body.data.jobNumber).toBe('JOB-1002');
      expect((await cara.get('/api/jobs')).body.meta.total).toBe(0);
      await rex.post(`/api/jobs/${ok.body.data.jobId}/publish`).expect(403);
      await admin.post(`/api/jobs/${ok.body.data.jobId}/publish`).expect(200);
      expect((await cara.get('/api/jobs')).body.meta.total).toBe(1);
    });

    it('rejected requests never become jobs', async () => {
      const r = await rex.post('/api/job-requests').send({ companyId, spec: fullSpec({ title: 'Rejected Role' }) }).expect(201);
      await rex.post(`/api/job-requests/${r.body.data.id}/submit`).expect(200);
      await admin.post(`/api/job-requests/${r.body.data.id}/reject`).send({ note: 'Outside our scope' }).expect(200);
      expect((await cara.get('/api/jobs?search=rejected')).body.meta.total).toBe(0);
      expect((await rex.get(`/api/job-requests/${r.body.data.id}`)).body.data.status).toBe('REJECTED');
    });

    it('unsubmitted drafts can be deleted', async () => {
      const r = await rex.post('/api/job-requests').send({ companyId }).expect(201);
      await rex.delete(`/api/job-requests/${r.body.data.id}`).expect(200);
      await rex.get(`/api/job-requests/${r.body.data.id}`).expect(404);
    });
  });

  it('every step was audited', async () => {
    const res = await admin.get(`/api/audit-logs?entityType=JobRequest&entityId=${requestId}&sort=createdAt`).expect(200);
    expect(res.body.data.map((l: any) => l.action)).toEqual(['JOB_CREATED', 'JOB_CHANGES_REQUESTED', 'JOB_RESUBMITTED', 'JOB_APPROVED']);
    expect(res.body.data[1]).toMatchObject({ reason: 'Please clarify the salary band', actorName: 'Admin' });
  });

  describe('commission on a job', () => {
    it('nothing is approved or published without a commission; Admin can reshape the opening first', async () => {
      const r = (await rex.post('/api/job-requests').send({ companyId, spec: fullSpec({ title: 'Reshape Me' }) }).expect(201)).body.data;
      await rex.post(`/api/job-requests/${r.id}/submit`).expect(200);
      // approving without a commission decides nothing
      const none = await admin.post(`/api/job-requests/${r.id}/approve`).send({}).expect(400);
      expect(none.body.error.code).toBe('COMMISSION_REQUIRED');
      expect((await admin.get(`/api/job-requests/${r.id}`)).body.data.status).toBe('PENDING_ADMIN_REVIEW');

      // Admin changes whatever he wants while it waits; the recruiter's versions stay as submitted
      await rex.patch(`/api/job-requests/${r.id}`).send({ spec: { title: 'Nope' } }).expect(200); // recruiter edit -> v2, just to have history
      const edited = (await admin.patch(`/api/job-requests/${r.id}`).send({ spec: { title: 'Reshaped Role', compensation: { salaryMax: 4800000000 } } }).expect(200)).body.data;
      expect(edited).toMatchObject({ status: 'PENDING_ADMIN_REVIEW', spec: { title: 'Reshaped Role' } });
      expect(edited.reviews.at(-1)).toMatchObject({ action: 'ADMIN_EDITED', byRole: 'ADMIN' });
      await admin.patch(`/api/job-requests/${r.id}`).send({ spec: { title: 'Reshaped Role' } }).expect(400); // nothing changed
      await cara.patch(`/api/job-requests/${r.id}`).send({ spec: { title: 'x' } }).expect(403);

      // approved but held back: still needs a commission to be published, and Admin can keep editing
      const done = (await admin.post(`/api/job-requests/${r.id}/approve`).send({ publish: false, commission: { type: 'PERCENT', percent: 12.5 } }).expect(200)).body.data;
      const fix = await admin.patch(`/api/jobs/${done.jobId}`).send({ spec: { location: 'Mumbai' } }).expect(200);
      expect(fix.body.data.changed).toEqual(['Location']);
      expect((await rex.get(`/api/job-requests/${r.id}`)).body.data.spec.location).toBe('Mumbai');
      await rex.patch(`/api/jobs/${done.jobId}`).send({ spec: { location: 'Pune' } }).expect(403);

      // a job with no commission on record cannot go live (e.g. an older job)
      await conn.collection('commissionrules').deleteMany({ refId: new (require('mongodb').ObjectId)(done.jobId) });
      const blocked = await admin.post(`/api/jobs/${done.jobId}/publish`).send({}).expect(400);
      expect(blocked.body.error.code).toBe('COMMISSION_REQUIRED');
      expect((await cara.get('/api/jobs')).body.data.some((j: any) => j.id === done.jobId)).toBe(false);
      await admin.post(`/api/jobs/${done.jobId}/publish`).send({ commission: { type: 'PERCENT', percent: 20 } }).expect(200);
      const live = (await cara.get(`/api/jobs/${done.jobId}`).expect(200)).body.data;
      expect(live.spec.compensation.salaryMax).toBe(Math.round(4800000000 * 0.8)); // the candidate sees the pay left after our 20%
      // once live Admin can still edit directly (the candidate sees it at once); a recruiter has to ask
      await admin.patch(`/api/jobs/${done.jobId}`).send({ spec: { location: 'Delhi' } }).expect(200);
      expect((await cara.get(`/api/jobs/${done.jobId}`)).body.data.spec.location).toBe('Delhi');
      // Admin can change the commission on this opening whenever he likes; nobody else can
      await rex.put(`/api/jobs/${done.jobId}/commission`).send({ type: 'PERCENT', percent: 30 }).expect(403);
      await cara.put(`/api/jobs/${done.jobId}/commission`).send({ type: 'PERCENT', percent: 30 }).expect(403);
      await admin.put(`/api/jobs/${done.jobId}/commission`).send({ type: 'PERCENT', percent: 100 }).expect(400);
      const changed = (await admin.put(`/api/jobs/${done.jobId}/commission`).send({ type: 'PERCENT', percent: 30 }).expect(200)).body.data;
      expect(changed).toMatchObject({ type: 'PERCENT', percent: 30, source: 'JOB' });
      expect((await cara.get(`/api/jobs/${done.jobId}`)).body.data.spec.compensation.salaryMax).toBe(Math.round(4800000000 * 0.7));
      expect(JSON.stringify((await rex.get(`/api/jobs/${done.jobId}`)).body.data)).not.toMatch(/commission/i);
      await admin.post(`/api/jobs/${done.jobId}/close`).send({ reason: 'Filled' }).expect(200);
      await admin.put(`/api/jobs/${done.jobId}/commission`).send({ type: 'PERCENT', percent: 10 }).expect(409);
      await admin.patch(`/api/jobs/${done.jobId}`).send({ spec: { location: 'Pune' } }).expect(409); // closed: no edits
      // the candidate's own application view shows the same figure, never the company's
    });

    it('Admin sets the commission when approving; candidates see the pay left after it, recruiters never see it', async () => {
      const spec = fullSpec({ title: 'Priced Role', compensation: { salaryMin: 3000000, salaryMax: 3000000, currency: 'INR', payBasis: 'MONTH' } }); // 30,000 a month from the company
      const r = (await rex.post('/api/job-requests').send({ companyId, spec }).expect(201)).body.data;
      await rex.post(`/api/job-requests/${r.id}/submit`).expect(200);
      const before = (await admin.get(`/api/job-requests/${r.id}`).expect(200)).body.data;
      expect(before.commission).toMatchObject({ type: 'PERCENT', source: 'DEFAULT' }); // what would apply if Admin does nothing

      await admin.post(`/api/job-requests/${r.id}/approve`).send({ commission: { type: 'PERCENT', percent: 120 } }).expect(400);
      await admin.post(`/api/job-requests/${r.id}/approve`).send({ commission: { type: 'FIXED', amount: 3000000 } }).expect(400); // would leave nothing
      expect((await admin.get(`/api/job-requests/${r.id}`).expect(200)).body.data.status).toBe('PENDING_ADMIN_REVIEW'); // a bad figure decides nothing

      const done = (await admin.post(`/api/job-requests/${r.id}/approve`).send({ commission: { type: 'FIXED', amount: 1000000 } }).expect(200)).body.data; // takes 10,000 of the 30,000
      const adminView = (await admin.get(`/api/job-requests/${r.id}`).expect(200)).body.data.commission;
      expect(adminView).toMatchObject({ type: 'FIXED', amount: 1000000, source: 'JOB', candidateCompensation: { salaryMin: 2000000, salaryMax: 2000000 } });

      // the candidate and the public are shown 20,000
      const seen = (await cara.get(`/api/jobs/${done.jobId}`).expect(200)).body.data;
      expect(seen.spec.compensation).toMatchObject({ salaryMin: 2000000, salaryMax: 2000000 });
      const pub = (await request(app.getHttpServer()).get(`/api/public/jobs/${done.jobId}`).expect(200)).body.data;
      expect(pub.spec.compensation.salaryMax).toBe(2000000);
      // the recruiter keeps seeing what the company pays, with no sign of a commission
      const mine = (await rex.get(`/api/jobs/${done.jobId}`).expect(200)).body.data;
      expect(mine.spec.compensation.salaryMax).toBe(3000000);
      const mineReq = JSON.stringify((await rex.get(`/api/job-requests/${r.id}`).expect(200)).body.data);
      expect(mineReq).not.toMatch(/commission/i);
      expect(JSON.stringify(seen)).not.toMatch(/commission/i);

      // a percentage works the same way
      const r2 = (await rex.post('/api/job-requests').send({ companyId, spec: fullSpec({ title: 'Percent Role', compensation: { salaryMin: 3000000, salaryMax: 4000000, currency: 'INR', payBasis: 'MONTH' } }) }).expect(201)).body.data;
      await rex.post(`/api/job-requests/${r2.id}/submit`).expect(200);
      const d2 = (await admin.post(`/api/job-requests/${r2.id}/approve`).send({ commission: { type: 'PERCENT', percent: 25 } }).expect(200)).body.data;
      expect((await cara.get(`/api/jobs/${d2.jobId}`).expect(200)).body.data.spec.compensation).toMatchObject({ salaryMin: 2250000, salaryMax: 3000000 });
    });
  });
});
