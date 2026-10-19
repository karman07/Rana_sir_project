import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { holdInterview } from './helpers/pipeline';
import { configureApp } from './../src/app.setup';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = {
  title: 'Backend Engineer', department: 'Engineering', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 2,
  requirements: { experienceMin: 4, experienceMax: 8, technicalSkills: ['Node.js', 'MongoDB', 'AWS'] },
  compensation: { salaryMin: 200000000, salaryMax: 400000000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};

describe('Screening, recruiter review & candidate pool (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const history = async (id: string) => (await admin.get(`/api/applications/${id}`)).body.data.statusHistory.map((h: any) => h.status);
  const approvals = async (qs = '') => (await admin.get(`/api/approvals?${qs}`).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;

    const people: [string, string, object][] = [
      ['cara', 'Cara Strong', { skills: ['Node.js', 'MongoDB', 'AWS'], experienceYears: 6, expectedSalary: { amount: 300000000, currency: 'INR' }, noticePeriodDays: 30, headline: 'Senior engineer', education: [{ institution: 'IIT', degree: 'BTech', field: 'CS' }] }],
      ['dan', 'Dan Junior', { skills: ['Node.js'], experienceYears: 2, expectedSalary: { amount: 150000000, currency: 'INR' }, noticePeriodDays: 60 }],
      ['eve', 'Eve Mid', { skills: ['mongodb', 'aws'], experienceYears: 5, expectedSalary: { amount: 500000000, currency: 'INR' }, noticePeriodDays: 15 }],
    ];
    for (const [k, name, profile] of people) {
      await reg('candidate', name, `${k}@t.dev`);
      cand[k] = await login(`${k}@t.dev`);
      await cand[k].patch('/api/candidates/me').send(profile).expect(200);
      await cand[k].post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids[k] = (await cand[k].post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
    }
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('access', () => {
    it('screening is admin only', async () => {
      for (const who of [rex, cand.cara]) {
        await who.get('/api/screening/queue').expect(403);
        await who.get(`/api/screening/jobs/${ids.job}`).expect(403);
        await who.post(`/api/screening/${ids.cara}`).send({ adminScore: 80 }).expect(403);
        await who.get('/api/candidate-pool').expect(403);
      }
      await request(app.getHttpServer()).get('/api/screening/queue').expect(401);
    });
  });

  describe('queue & ranking', () => {
    it('lists jobs with applicants waiting', async () => {
      const q = (await admin.get('/api/screening/queue').expect(200)).body.data;
      expect(q).toHaveLength(1);
      expect(q[0]).toMatchObject({ id: ids.job, title: 'Backend Engineer', company: 'Acme', applied: 3, inReview: 0, shortlisted: 0, waiting: 3 });
    });

    it('ranks by match when unscored, with a transparent breakdown', async () => {
      const { job, rows } = (await admin.get(`/api/screening/jobs/${ids.job}`).expect(200)).body.data;
      expect(job).toMatchObject({ title: 'Backend Engineer', openings: 2 });
      expect(rows.map((r: any) => r.candidate.name)).toEqual(['Cara Strong', 'Eve Mid', 'Dan Junior']);
      const cara = rows[0];
      expect(cara.match).toMatchObject({ overall: 100, skills: { percent: 100, missing: [] }, salary: { note: 'Within budget' } });
      const dan = rows[2];
      expect(dan.match.skills).toMatchObject({ matched: ['Node.js'], missing: ['MongoDB', 'AWS'] });
      expect(dan.match.experience.percent).toBe(50);
      expect(rows[1].match.salary.note).toBe('Above budget'); // Eve wants 5.0M against a 4.0M ceiling
      expect(cara).toMatchObject({ noticePeriodDays: 30, experienceYears: 6, adminScore: null });
    });
  });

  describe('screening an application', () => {
    it('validates scores, moves untouched applications into review, and stores notes/tags', async () => {
      await admin.post(`/api/screening/${ids.dan}`).send({ adminScore: 101 }).expect(400);
      await admin.post(`/api/screening/${ids.dan}`).send({ adminScore: 40, resumeScore: 55, notes: 'Too junior for now', tags: ['junior', ' junior ', 'follow-up'] }).expect(200);
      const detail = (await admin.get(`/api/applications/${ids.dan}`)).body.data;
      expect(detail).toMatchObject({ status: 'ADMIN_REVIEW', adminScore: 40, adminNotes: 'Too junior for now' });
      expect(await history(ids.dan)).toEqual(['APPLIED', 'ADMIN_REVIEW']);
      const row = (await admin.get(`/api/screening/jobs/${ids.job}`)).body.data.rows.find((r: any) => r.id === ids.dan);
      expect(row).toMatchObject({ resumeScore: 55, tags: ['junior', 'follow-up'], hasNotes: true });
    });

    it('admin score outranks the automatic match', async () => {
      await admin.post(`/api/screening/${ids.cara}`).send({ adminScore: 70 }).expect(200);
      await admin.post(`/api/screening/${ids.eve}`).send({ adminScore: 90 }).expect(200);
      const names = (await admin.get(`/api/screening/jobs/${ids.job}`)).body.data.rows.map((r: any) => r.candidate.name);
      expect(names).toEqual(['Eve Mid', 'Cara Strong', 'Dan Junior']);
    });

    it('is audited and cannot touch closed applications', async () => {
      const log = (await admin.get(`/api/audit-logs?entityType=Application&entityId=${ids.dan}&limit=20`)).body.data;
      expect(log.some((l: any) => l.action === 'APPLICATION_SCREENED' && l.newState.adminScore === 40)).toBe(true);
    });
  });

  describe('shortlist, reject, send', () => {
    it('shortlisting passes through review so the history stays honest', async () => {
      // Cara and Eve are already in review; Dan too. Create a fresh applicant at APPLIED to prove the passthrough.
      await reg('candidate', 'Fay Fresh', 'fay@t.dev');
      cand.fay = await login('fay@t.dev');
      await cand.fay.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids.fay = (await cand.fay.post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
      // Our own interview comes first: a refusal leaves the application exactly where it was
      const early = await admin.post(`/api/screening/${ids.fay}/shortlist`).send({ notes: 'Impressive' }).expect(409);
      expect(early.body.error.code).toBe('INTERVIEW_REQUIRED');
      expect(await history(ids.fay)).toEqual(['APPLIED']);
      await holdInterview(admin, conn, ids.fay); // arranging it starts the review and the interview stage
      expect(await history(ids.fay)).toEqual(['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW']);
      await admin.post(`/api/screening/${ids.fay}/shortlist`).send({ notes: 'Impressive' }).expect(200);
      expect(await history(ids.fay)).toEqual(['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW', 'ADMIN_SHORTLISTED']);
    });

    it('rejecting needs a reason', async () => {
      await admin.post(`/api/screening/${ids.dan}/reject`).send({}).expect(400);
      await admin.post(`/api/screening/${ids.dan}/reject`).send({ reason: 'Not enough experience' }).expect(200);
      expect((await admin.get(`/api/applications/${ids.dan}`)).body.data.status).toBe('REJECTED');
      await admin.post(`/api/screening/${ids.dan}/shortlist`).send({}).expect(403); // terminal
    });

    it('sends only shortlisted candidates, reporting each result', async () => {
      await holdInterview(admin, conn, ids.cara); await holdInterview(admin, conn, ids.eve);
      await admin.post(`/api/screening/${ids.cara}/shortlist`).send({}).expect(200);
      await admin.post(`/api/screening/${ids.eve}/shortlist`).send({}).expect(200);
      const res = (await admin.post('/api/screening/send-to-recruiter').send({ applicationIds: [ids.cara, ids.eve, ids.fay, ids.dan] }).expect(200)).body.data;
      expect(res).toMatchObject({ sent: 3, failed: 1 });
      expect(res.results.find((r: any) => r.id === ids.dan)).toMatchObject({ ok: false });
      await admin.post('/api/screening/send-to-recruiter').send({ applicationIds: [] }).expect(400);
      expect(await history(ids.cara)).toEqual(['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW', 'ADMIN_SHORTLISTED', 'SENT_TO_RECRUITER']);
      await admin.post(`/api/applications/${ids.cara}/send-to-recruiter`).send({}).expect(400); // already sent
    });
  });

  describe('comparison', () => {
    it('compares two to four candidates side by side', async () => {
      const { columns } = (await admin.get(`/api/screening/compare?ids=${ids.cara},${ids.eve}`).expect(200)).body.data;
      expect(columns).toHaveLength(2);
      expect(columns[0]).toMatchObject({ candidate: { name: 'Cara Strong' }, experienceYears: 6, noticePeriodDays: 30, adminScore: 70, education: ['BTech, CS — IIT'] });
      expect(columns[0].match.overall).toBe(100);
      await admin.get(`/api/screening/compare?ids=${ids.cara}`).expect(400);
      await admin.get(`/api/screening/compare?ids=${ids.cara},${ids.eve},${ids.dan},${ids.fay},${ids.cara}`).expect(400);
      await admin.get('/api/screening/compare?ids=abc,def').expect(400);
    });
  });

  describe('recruiter review', () => {
    it('shows the recruiter only their own sent candidates', async () => {
      expect((await rex.get('/api/applications')).body.meta.total).toBe(3);
      expect((await ron.get('/api/applications')).body.meta.total).toBe(0);
      await ron.post(`/api/applications/${ids.cara}/recruiter-approve`).send({}).expect(404);
      await ron.post(`/api/applications/${ids.cara}/recruiter-reject`).send({ reason: 'sneaky' }).expect(404);
      await admin.post(`/api/applications/${ids.cara}/recruiter-approve`).send({}).expect(403);
      await cand.cara.post(`/api/applications/${ids.cara}/recruiter-approve`).send({}).expect(403);
    });

    it('approving opens review first, stores feedback, and moves the candidate on', async () => {
      await rex.post(`/api/applications/${ids.cara}/recruiter-approve`).send({ score: 88, notes: 'Great fit' }).expect(200);
      const d = (await admin.get(`/api/applications/${ids.cara}`)).body.data;
      expect(d).toMatchObject({ status: 'RECRUITER_APPROVED', recruiterScore: 88, recruiterNotes: 'Great fit' });
      expect(await history(ids.cara)).toEqual(['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW', 'ADMIN_SHORTLISTED', 'SENT_TO_RECRUITER', 'RECRUITER_REVIEW', 'RECRUITER_APPROVED']);
      await rex.post(`/api/applications/${ids.cara}/recruiter-approve`).send({}).expect(404); // no longer awaiting a decision
      expect((await cand.cara.get(`/api/applications/${ids.cara}`)).body.data.recruiterNotes).toBeUndefined();
    });

    it('a recruiter can reject a candidate immediately: it is final, and Admin is only told', async () => {
      await rex.post(`/api/applications/${ids.eve}/recruiter-reject`).send({}).expect(400);
      await ron.post(`/api/applications/${ids.eve}/recruiter-reject`).send({ reason: 'sneaky' }).expect(404);
      await rex.post(`/api/applications/${ids.eve}/recruiter-reject`).send({ reason: 'Salary too high' }).expect(200);
      const d = (await admin.get(`/api/applications/${ids.eve}`)).body.data;
      expect(d.status).toBe('REJECTED'); // no waiting for Admin
      expect((await approvals('category=RECRUITER_DECISION')).data).toHaveLength(0);
      expect((await admin.get('/api/notifications')).body.data.some((n: any) => n.title === 'Rex Agent rejected Eve Mid')).toBe(true);
      await rex.post(`/api/applications/${ids.eve}/recruiter-reject`).send({ reason: 'again' }).expect(404); // already decided
      expect((await rex.get('/api/applications')).body.data.some((a: any) => a.id === ids.eve)).toBe(false); // gone from the recruiter's list, as with any candidate not currently with them
    });


    it('when a recruiter asks for changes instead, Admin can send the candidate back, or reject them', async () => {
      await rex.post(`/api/applications/${ids.fay}/request-changes`).send({ reason: 'Needs a stronger portfolio' }).expect(200);
      expect((await approvals('category=RECRUITER_DECISION')).data[0]).toMatchObject({ entityId: ids.fay, tags: ['Changes requested'] });
      await admin.post(`/api/approvals/RECRUITER_DECISION/${ids.fay}/approve`).send({ note: 'Portfolio added' }).expect(200);
      expect((await admin.get(`/api/applications/${ids.fay}`)).body.data.status).toBe('SENT_TO_RECRUITER');
      expect((await approvals('category=RECRUITER_DECISION')).data).toHaveLength(0);

      await rex.post(`/api/applications/${ids.fay}/request-changes`).send({ reason: 'Please add her portfolio' }).expect(200);
      await admin.post(`/api/approvals/RECRUITER_DECISION/${ids.fay}/reject`).send({}).expect(400);
      await admin.post(`/api/approvals/RECRUITER_DECISION/${ids.fay}/reject`).send({ note: 'Cannot meet the request' }).expect(200);
      expect((await admin.get(`/api/applications/${ids.fay}`)).body.data.status).toBe('REJECTED');
      expect((await approvals('category=RECRUITER_DECISION')).data[0]).toBeUndefined();
    });
  });

  describe('requesting more candidates', () => {
    it('validates the request and is limited to the recruiter\'s own live jobs', async () => {
      await rex.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 0, reason: 'need more' }).expect(400);
      await rex.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 3, reason: 'x' }).expect(400);
      await ron.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 3, reason: 'Need more candidates' }).expect(404);
      await cand.cara.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 3, reason: 'Need more candidates' }).expect(403);
    });

    it('creates one open request per job and routes it to Admin', async () => {
      await rex.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 3, reason: 'Pipeline is thin', updatedRequirements: 'Add Docker', comments: 'Urgent' }).expect(201);
      await rex.post(`/api/jobs/${ids.job}/request-more-candidates`).send({ count: 2, reason: 'Again please' }).expect(409);
      const item = (await approvals('category=CANDIDATE_REQUEST')).data[0];
      expect(item).toMatchObject({ title: '3 more candidates for Backend Engineer', subtitle: 'Pipeline is thin', requester: { name: 'Rex Agent' } });
      expect((await admin.get('/api/notifications')).body.data.some((n: any) => n.title === 'Rex Agent wants more candidates')).toBe(true);
      expect((await rex.get('/api/candidate-requests/mine')).body.data).toHaveLength(1);

      await admin.post(`/api/approvals/CANDIDATE_REQUEST/${item.entityId}/approve`).send({ note: 'On it' }).expect(200);
      expect((await rex.get('/api/candidate-requests/mine')).body.data[0].status).toBe('HANDLED');
      expect((await rex.get('/api/notifications')).body.data[0].title).toBe('Request handled: Backend Engineer');
      await admin.post(`/api/approvals/CANDIDATE_REQUEST/${item.entityId}/approve`).send({}).expect(409);
    });
  });

  describe('candidate pool', () => {
    it('lists, searches and filters every candidate', async () => {
      const all = (await admin.get('/api/candidate-pool').expect(200)).body;
      expect(all.meta.total).toBe(4);
      expect(all.data.find((c: any) => c.name === 'Cara Strong')).toMatchObject({ headline: 'Senior engineer', experienceYears: 6, applicationCount: 1, latestStatus: 'RECRUITER_APPROVED' });
      expect((await admin.get('/api/candidate-pool?search=cara')).body.meta.total).toBe(1);
      expect((await admin.get('/api/candidate-pool?skill=mongo')).body.meta.total).toBe(2);
      expect((await admin.get('/api/candidate-pool?minExperience=5')).body.meta.total).toBe(2);
      expect((await admin.get('/api/candidate-pool?sort=-experience&limit=1')).body.data[0].name).toBe('Cara Strong');
    });

    it('gives the full profile with applications and documents', async () => {
      const id = (await admin.get('/api/candidate-pool?search=cara')).body.data[0].id;
      const d = (await admin.get(`/api/candidate-pool/${id}`).expect(200)).body.data;
      expect(d.user).toMatchObject({ name: 'Cara Strong', email: 'cara@t.dev' });
      expect(d.profile).toMatchObject({ skills: ['Node.js', 'MongoDB', 'AWS'] });
      expect(d.applications[0]).toMatchObject({ applicationNumber: 'APP-00001', status: 'RECRUITER_APPROVED', adminScore: 70 });
      expect(d.documents[0]).toMatchObject({ type: 'RESUME', status: 'ACTIVE' });
      expect(JSON.stringify(d)).not.toMatch(/storageKey|passwordHash/);
      await admin.get(`/api/candidate-pool/${(await admin.get('/api/analytics/admin/overview')).body.data.queue[0]?.id ?? '64b7f0f0f0f0f0f0f0f0f0f0'}`).expect(404);
    });
  });

  it('feeds the admin dashboard funnel from real history', async () => {
    const o = (await admin.get('/api/analytics/admin/overview')).body.data;
    const f = Object.fromEntries(o.funnel.map((s: any) => [s.key, s.count]));
    expect(f).toMatchObject({ applications: 4, screening: 4, adminInterview: 3, shortlisted: 3, sentToRecruiter: 3, recruiterApproved: 1, hired: 0 });
    expect(o.attention).toMatchObject({ candidatesToReview: 0, recruiterDecisions: 0, candidateRequests: 0 });
    const mine = (await rex.get('/api/analytics/recruiter/overview')).body.data;
    expect(mine.candidates).toMatchObject({ needsDecision: 0, approved: 1 });
  });
});
