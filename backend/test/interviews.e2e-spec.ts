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
import { Interview } from './../src/interviews/schemas/interview.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = {
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 2,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] }, compensation: { salaryMin: 100000, salaryMax: 200000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};
const inDays = (d: number, hour = 10) => { const t = new Date(Date.now() + d * 86_400_000); t.setUTCHours(hour, 0, 0, 0); return t.toISOString(); };

describe('Interviews (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let interviews: Model<Interview>, emails: Model<Email>;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, ron: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const base = (over: Record<string, unknown> = {}) => ({ applicationId: ids.cara, type: 'VIDEO', startsAt: inDays(5), durationMinutes: 45, timezone: 'Asia/Kolkata', meetingLink: 'https://meet.example.com/abc', interviewers: [{ name: 'Priya Nair' }], instructions: 'Join 5 minutes early', notes: 'INTERNAL: probe salary', ...over });
  const notes = async (a: typeof admin) => (await a.get('/api/notifications?limit=50')).body.data;
  const approveFor = async (appId: string) => {
    await adminScreen(admin, conn, appId);
    await admin.patch(`/api/applications/${appId}/status`).send({ status: 'SENT_TO_RECRUITER' }).expect(200);
    await rex.post(`/api/applications/${appId}/recruiter-approve`).send({}).expect(200);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    interviews = moduleRef.get(getModelToken(Interview.name));
    emails = moduleRef.get(getModelToken(Email.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    for (const [n, e] of [['Rex Agent', 'rex@t.dev'], ['Ron Agent', 'ron@t.dev']]) { const r = await reg('recruiter', n, e); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200); }
    rex = await login('rex@t.dev'); ron = await login('ron@t.dev');
    ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
    await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
    const jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
    await rex.post(`/api/job-requests/${jr}/submit`).expect(200);
    ids.job = (await admin.post(`/api/job-requests/${jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
    for (const [k, name] of [['cara', 'Cara Candidate'], ['dan', 'Dan Candidate']]) {
      await reg('candidate', name, `${k}@t.dev`);
      cand[k] = await login(`${k}@t.dev`);
      await cand[k].post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids[k] = (await cand[k].post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
    }
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('scheduling', () => {
    it('needs the candidate to be in screening, or approved by the recruiter', async () => {
      await rex.patch(`/api/applications/${ids.cara}/status`).send({ status: 'ADMIN_REVIEW' }).expect(404); // nothing of theirs yet
      await admin.patch(`/api/applications/${ids.cara}/status`).send({ status: 'ADMIN_REVIEW' }).expect(200);
      await admin.patch(`/api/applications/${ids.cara}/status`).send({ status: 'ADMIN_INTERVIEW' }).expect(200);
      await admin.patch(`/api/applications/${ids.cara}/status`).send({ status: 'ADMIN_SHORTLISTED', override: true, reason: 'Test set-up' }).expect(200);
      await admin.patch(`/api/applications/${ids.cara}/status`).send({ status: 'SENT_TO_RECRUITER' }).expect(200);
      const r = await admin.post('/api/interviews').send(base()).expect(409); // sent to the recruiter: round one is over, round two awaits their approval
      expect(r.body.error.code).toBe('NOT_SCHEDULABLE');
      await rex.post(`/api/applications/${ids.cara}/recruiter-approve`).send({}).expect(200);
    });

    it('validates the details', async () => {
      await admin.post('/api/interviews').send(base({ meetingLink: undefined })).expect(400);
      await admin.post('/api/interviews').send(base({ meetingLink: 'javascript:alert(1)' })).expect(400);
      await admin.post('/api/interviews').send(base({ type: 'IN_PERSON', meetingLink: undefined })).expect(400);
      await admin.post('/api/interviews').send(base({ startsAt: new Date(Date.now() - 3600_000).toISOString() })).expect(400);
      await admin.post('/api/interviews').send(base({ timezone: 'Mars/Base' })).expect(400);
      await admin.post('/api/interviews').send(base({ durationMinutes: 5 })).expect(400);
      await admin.post('/api/interviews').send(base({ type: 'FACE' })).expect(400);
    });

    it('only staff can schedule, and a recruiter only for their own candidates', async () => {
      await cand.cara.post('/api/interviews').send(base()).expect(403);
      await ron.post('/api/interviews').send(base()).expect(404);
    });

    it('schedules, moves the application to INTERVIEW, and tells everyone involved', async () => {
      const res = await admin.post('/api/interviews').send(base()).expect(201);
      ids.int1 = res.body.data.id;
      expect(res.body.data).toMatchObject({ interviewNumber: 'INT-0001', stage: 'RECRUITER', round: 1, status: 'SCHEDULED', type: 'VIDEO', timezone: 'Asia/Kolkata', candidate: { name: 'Cara Candidate' }, job: { title: 'Backend Engineer', company: 'Acme' } });
      expect((await admin.get(`/api/applications/${ids.cara}`)).body.data.status).toBe('INTERVIEW');

      expect((await notes(cand.cara)).find((n: any) => n.title === 'Interview scheduled: Backend Engineer')).toMatchObject({ link: '/candidate/interviews', type: 'INTERVIEW' });
      expect((await notes(rex)).some((n: any) => n.title === 'Interview scheduled: Backend Engineer')).toBe(true);
      const mail = await emails.findOne({ to: 'cara@t.dev', template: 'interview-scheduled' }).select('+html').lean();
      expect(mail!.html).toContain('2026');
      expect(mail!.html).toContain('Backend Engineer');
      const reminder = await emails.findOne({ to: 'cara@t.dev', template: 'interview-reminder' }).lean();
      expect(reminder).toMatchObject({ status: 'QUEUED' });
      expect(+reminder!.nextAttemptAt).toBeGreaterThan(Date.now() + 3 * 86_400_000);
    });

    it('refuses overlapping interviews for the same candidate but allows back-to-back ones', async () => {
      const clash = await admin.post('/api/interviews').send(base({ startsAt: new Date(+new Date(inDays(5)) + 30 * 60_000).toISOString() })).expect(409);
      expect(clash.body.error.code).toBe('INTERVIEW_CONFLICT');
      await admin.post('/api/interviews').send(base({ startsAt: new Date(+new Date(inDays(5)) + 45 * 60_000).toISOString(), instructions: 'Round two' })).expect(201);
      expect(await interviews.countDocuments({})).toBe(2);
    });
  });

  describe('visibility', () => {
    it('hides internal notes from the candidate and shows interviews only to the right people', async () => {
      const mine = (await cand.cara.get('/api/interviews').expect(200)).body;
      expect(mine.meta.total).toBe(2);
      expect(mine.data[0]).toMatchObject({ instructions: 'Join 5 minutes early', meetingLink: 'https://meet.example.com/abc' });
      expect(JSON.stringify(mine)).not.toMatch(/INTERNAL|probe salary|history/);
      expect((await cand.dan.get('/api/interviews')).body.meta.total).toBe(0);
      await cand.dan.get(`/api/interviews/${ids.int1}`).expect(404);
      expect((await rex.get('/api/interviews')).body.meta.total).toBe(2);
      expect((await ron.get('/api/interviews')).body.meta.total).toBe(0);
      await ron.get(`/api/interviews/${ids.int1}`).expect(404);
      const staff = (await rex.get(`/api/interviews/${ids.int1}`)).body.data;
      expect(staff.notes).toBe('INTERNAL: probe salary');
      expect(staff.feedback).toEqual([]);
      await request(app.getHttpServer()).get('/api/interviews').expect(401);
    });

    it('filters by time window and counts what is coming up', async () => {
      expect((await admin.get('/api/interviews?upcoming=true')).body.data.map((i: any) => i.round)).toEqual([1, 2]);
      expect((await admin.get(`/api/interviews?from=${encodeURIComponent(inDays(6))}`)).body.meta.total).toBe(0);
      expect((await admin.get('/api/interviews?status=CANCELLED')).body.meta.total).toBe(0);
      expect((await cand.cara.get('/api/interviews/summary')).body.data).toMatchObject({ upcoming: 2, thisWeek: 2 });
      expect((await admin.get('/api/analytics/admin/overview')).body.data.totals.interviewsThisWeek).toBe(2);
    });
  });

  describe('changing an interview', () => {
    it('editing details alone keeps the same interview and tells the candidate', async () => {
      const r = await rex.patch(`/api/interviews/${ids.int1}`).send({ meetingLink: 'https://meet.example.com/new' }).expect(200);
      expect(r.body.data).toMatchObject({ id: ids.int1, meetingLink: 'https://meet.example.com/new', status: 'SCHEDULED' });
      expect((await notes(cand.cara)).some((n: any) => n.title === 'Interview details updated: Backend Engineer')).toBe(true);
      await ron.patch(`/api/interviews/${ids.int1}`).send({ instructions: 'x' }).expect(404);
      await cand.cara.patch(`/api/interviews/${ids.int1}`).send({ instructions: 'x' }).expect(403);
    });

    it('a new time reschedules: old slot kept as history, reminder replaced, everyone emailed', async () => {
      const before = await emails.countDocuments({ to: 'cara@t.dev', template: 'interview-reminder' });
      const r = await admin.patch(`/api/interviews/${ids.int1}`).send({ startsAt: inDays(7, 14), reason: 'Panel unavailable' }).expect(200);
      ids.int1b = r.body.data.id;
      expect(r.body.data.id).not.toBe(ids.int1);
      expect(r.body.data).toMatchObject({ status: 'SCHEDULED', round: 1, rescheduledFrom: ids.int1 });
      const old = (await admin.get(`/api/interviews/${ids.int1}`)).body.data;
      expect(old).toMatchObject({ status: 'RESCHEDULED', rescheduledTo: ids.int1b });
      expect(old.history.map((h: any) => h.status)).toEqual(['SCHEDULED', 'RESCHEDULED']);

      expect(await emails.countDocuments({ to: 'cara@t.dev', template: 'interview-reminder' })).toBe(before);
      expect(await emails.findOne({ to: 'cara@t.dev', template: 'interview-rescheduled' }).lean()).toBeTruthy();
      expect((await notes(rex)).some((n: any) => n.title === 'Interview rescheduled: Backend Engineer')).toBe(true);
      expect((await cand.cara.get('/api/interviews?status=RESCHEDULED')).body.meta.total).toBe(1);
      await admin.patch(`/api/interviews/${ids.int1}`).send({ startsAt: inDays(8) }).expect(409);
    });

    it('cancelling needs a reason, removes the reminder and cannot be repeated', async () => {
      const second = (await admin.get('/api/interviews?upcoming=true')).body.data.find((i: any) => i.instructions === 'Round two').id;
      await admin.post(`/api/interviews/${second}/cancel`).send({}).expect(400);
      const remindersBefore = await emails.countDocuments({ template: 'interview-reminder', status: 'QUEUED' });
      await rex.post(`/api/interviews/${second}/cancel`).send({ reason: 'Role on hold' }).expect(200);
      expect(await emails.countDocuments({ template: 'interview-reminder', status: 'QUEUED' })).toBe(remindersBefore - 1);
      expect((await emails.findOne({ to: 'cara@t.dev', template: 'interview-cancelled' }).select('+html').lean())!.html).toContain('cancelled');
      await admin.post(`/api/interviews/${second}/cancel`).send({ reason: 'again' }).expect(409);
      expect((await admin.get(`/api/interviews/${second}`)).body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Role on hold' });
    });
  });

  describe('completing and feedback', () => {
    const rating = { overallRating: 4, technicalRating: 5, communicationRating: 4, cultureFit: 3, strengths: 'Strong systems thinking', weaknesses: 'Light on testing', recommendation: 'HIRE', notes: 'Good conversation' };

    it('cannot be closed out or reviewed before it has started', async () => {
      await admin.post(`/api/interviews/${ids.int1b}/complete`).expect(409);
      await admin.post(`/api/interviews/${ids.int1b}/no-show`).expect(409);
      const r = await rex.post(`/api/interviews/${ids.int1b}/feedback`).send(rating).expect(409);
      expect(r.body.error.code).toBe('NOT_STARTED');
      await interviews.updateOne({ _id: ids.int1b }, { startsAt: new Date(Date.now() - 2 * 3600_000) });
    });

    it('validates feedback and keeps one entry per person (revisable)', async () => {
      await rex.post(`/api/interviews/${ids.int1b}/feedback`).send({ ...rating, overallRating: 6 }).expect(400);
      await rex.post(`/api/interviews/${ids.int1b}/feedback`).send({ ...rating, recommendation: 'MAYBE_LATER' }).expect(400);
      await rex.post(`/api/interviews/${ids.int1b}/feedback`).send({ overallRating: 4 }).expect(400);
      await cand.cara.post(`/api/interviews/${ids.int1b}/feedback`).send(rating).expect(403);
      await ron.post(`/api/interviews/${ids.int1b}/feedback`).send(rating).expect(404);

      await rex.post(`/api/interviews/${ids.int1b}/feedback`).send(rating).expect(200);
      await rex.post(`/api/interviews/${ids.int1b}/feedback`).send({ ...rating, recommendation: 'STRONG_HIRE', overallRating: 5 }).expect(200);
      await admin.post(`/api/interviews/${ids.int1b}/feedback`).send({ ...rating, recommendation: 'MAYBE' }).expect(200);

      const d = (await admin.get(`/api/interviews/${ids.int1b}`)).body.data;
      expect(d.status).toBe('COMPLETED');
      expect(d.feedback).toHaveLength(2);
      expect(d.feedback.find((f: any) => f.authorRole === 'RECRUITER')).toMatchObject({ recommendation: 'STRONG_HIRE', overallRating: 5, authorName: 'Rex Agent' });
      const asCandidate = (await cand.cara.get(`/api/interviews/${ids.int1b}`).expect(200)).body;
      expect(asCandidate.data.feedback).toBeUndefined();
      expect(JSON.stringify(asCandidate)).not.toMatch(/STRONG_HIRE|Strong systems/);
    });

    it('notifies Admin about feedback', async () => {
      expect((await notes(admin)).some((x: any) => /^Feedback from Rex Agent: strong hire/.test(x.title))).toBe(true);
    });

    it('marks a no-show after the start time', async () => {
      await reg('candidate', 'Eve Absent', 'eve@t.dev');
      cand.eve = await login('eve@t.dev');
      await cand.eve.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids.eve = (await cand.eve.post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
      await approveFor(ids.eve);
      const i = (await rex.post('/api/interviews').send(base({ applicationId: ids.eve })).expect(201)).body.data.id;
      await interviews.updateOne({ _id: i }, { startsAt: new Date(Date.now() - 3600_000) });
      await rex.post(`/api/interviews/${i}/no-show`).expect(200);
      expect((await admin.get(`/api/interviews/${i}`)).body.data.status).toBe('NO_SHOW');
      expect((await notes(admin)).some((x: any) => x.title === 'No-show: Eve Absent')).toBe(true);
      await rex.post(`/api/interviews/${i}/complete`).expect(409);
    });
  });

  describe('round one: our own interview, before the recruiter', () => {
    it('is arranged by Admin while the candidate is being screened, and moves them into the interview stage', async () => {
      await reg('candidate', 'Gus Screened', 'gus@t.dev');
      cand.gus = await login('gus@t.dev');
      await cand.gus.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      ids.gus = (await cand.gus.post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data.id;
      await admin.patch(`/api/applications/${ids.gus}/status`).send({ status: 'ADMIN_REVIEW' }).expect(200);
      await rex.post('/api/interviews').send(base({ applicationId: ids.gus })).expect(403); // the recruiter does not run round one
      const r = await admin.post('/api/interviews').send(base({ applicationId: ids.gus, startsAt: inDays(3), instructions: 'A short chat about your background', interviewers: undefined })).expect(201);
      expect(r.body.data).toMatchObject({ stage: 'ADMIN', round: 1, status: 'SCHEDULED', interviewers: [{ name: 'Admin' }] });
      ids.adminIv = r.body.data.id;
      expect((await admin.get(`/api/applications/${ids.gus}`)).body.data.status).toBe('ADMIN_INTERVIEW');
      const second = await admin.post('/api/interviews').send(base({ applicationId: ids.gus, startsAt: inDays(4) })).expect(201);
      expect(second.body.data).toMatchObject({ stage: 'ADMIN', round: 2 }); // numbered within its own stage
      expect((await admin.get(`/api/applications/${ids.gus}`)).body.data.status).toBe('ADMIN_INTERVIEW');
    });

    it('tells the candidate, and never the hiring recruiter', async () => {
      const mine = (await cand.gus.get('/api/interviews').expect(200)).body.data;
      expect(mine).toHaveLength(2);
      expect(mine.every((i: any) => i.stage === 'ADMIN')).toBe(true);
      expect((await notes(cand.gus)).some((n: any) => /Interview scheduled/.test(n.title))).toBe(true);
      expect(await emails.countDocuments({ to: 'gus@t.dev', template: 'interview-scheduled' })).toBe(2);
      expect((await notes(rex)).some((n: any) => /Gus/.test(n.description ?? '') && /nterview/.test(n.title))).toBe(false);
      expect(await emails.countDocuments({ to: 'rex@t.dev', 'related.id': ids.adminIv })).toBe(0);
    });

    it('stays internal: the recruiter cannot list, open, change or read feedback on it', async () => {
      expect((await rex.get('/api/interviews?limit=50')).body.data.some((i: any) => i.stage === 'ADMIN')).toBe(false);
      expect((await rex.get(`/api/interviews?applicationId=${ids.gus}`)).body.meta.total).toBe(0);
      await rex.get(`/api/interviews/${ids.adminIv}`).expect(404);
      await rex.patch(`/api/interviews/${ids.adminIv}`).send({ instructions: 'x' }).expect(404);
      await rex.post(`/api/interviews/${ids.adminIv}/cancel`).send({ reason: 'not allowed' }).expect(404);
      await rex.post(`/api/interviews/${ids.adminIv}/feedback`).send({ overallRating: 4, technicalRating: 4, communicationRating: 4, cultureFit: 4, recommendation: 'HIRE', strengths: 'Fine', weaknesses: 'None', notes: 'x' }).expect(404);
      await ron.get(`/api/interviews/${ids.adminIv}`).expect(404);
      const staff = (await admin.get(`/api/interviews?stage=ADMIN&limit=50`)).body.data;
      expect(staff.map((i: any) => i.id)).toContain(ids.adminIv);
      expect((await admin.get('/api/interviews?stage=RECRUITER&limit=50')).body.data.some((i: any) => i.stage === 'ADMIN')).toBe(false);
      await admin.get('/api/interviews?stage=OTHER').expect(400);
    });

    it('keeps its stage when rescheduled, and only Admin holds it and records the outcome', async () => {
      const moved = await admin.patch(`/api/interviews/${ids.adminIv}`).send({ startsAt: inDays(6), reason: 'Candidate asked' }).expect(200);
      expect(moved.body.data).toMatchObject({ stage: 'ADMIN', round: 1 });
      ids.adminIv2 = moved.body.data.id;
      await interviews.updateOne({ _id: ids.adminIv2 }, { startsAt: new Date(Date.now() - 3600_000) });
      await rex.post(`/api/interviews/${ids.adminIv2}/complete`).expect(404);
      await admin.post(`/api/interviews/${ids.adminIv2}/feedback`).send({ overallRating: 4, technicalRating: 4, communicationRating: 5, cultureFit: 4, recommendation: 'HIRE', strengths: 'Clear and honest', weaknesses: 'Limited depth in testing', notes: 'Shortlist' }).expect(200);
      expect((await admin.get(`/api/interviews/${ids.adminIv2}`)).body.data.status).toBe('COMPLETED');
    });

    it('is what unlocks shortlisting, and then round two belongs to the recruiter', async () => {
      await admin.patch(`/api/applications/${ids.gus}/status`).send({ status: 'ADMIN_SHORTLISTED' }).expect(200);
      await admin.patch(`/api/applications/${ids.gus}/status`).send({ status: 'SENT_TO_RECRUITER' }).expect(200);
      expect((await admin.post('/api/interviews').send(base({ applicationId: ids.gus, startsAt: inDays(7) })).expect(409)).body.error.code).toBe('NOT_SCHEDULABLE');
      await rex.post(`/api/applications/${ids.gus}/recruiter-approve`).send({}).expect(200);
      const r2 = await rex.post('/api/interviews').send(base({ applicationId: ids.gus, startsAt: inDays(8) })).expect(201);
      expect(r2.body.data).toMatchObject({ stage: 'RECRUITER', round: 1 }); // the recruiter's own first interview
      expect((await admin.get(`/api/applications/${ids.gus}`)).body.data.status).toBe('INTERVIEW');
      const all = (await cand.gus.get('/api/interviews?limit=50')).body.data;
      expect(all.filter((i: any) => i.stage === 'ADMIN').length).toBe(3); // two scheduled, one of which was rescheduled
      expect(all.filter((i: any) => i.stage === 'RECRUITER')).toHaveLength(1);
    });

    it('the recruiter\'s summary counts only their own interviews', async () => {
      const mineCount = (await rex.get('/api/interviews?limit=50')).body.meta.total;
      const summary = (await rex.get('/api/interviews/summary')).body.data;
      const all = (await admin.get('/api/interviews/summary')).body.data;
      expect(summary.upcoming).toBeLessThan(all.upcoming);
      expect(mineCount).toBeGreaterThan(0);
    });
  });

  it('audits scheduling, rescheduling, cancelling and feedback', async () => {
    const log = (await admin.get('/api/audit-logs?entityType=Interview&limit=50')).body.data.map((l: any) => l.action);
    expect(log).toEqual(expect.arrayContaining(['INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_CANCELLED', 'INTERVIEW_FEEDBACK_SUBMITTED', 'INTERVIEW_UPDATED', 'INTERVIEW_NO_SHOW']));
  });
});
