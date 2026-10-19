import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { adminScreen } from './helpers/pipeline';
import { configureApp } from './../src/app.setup';
import { EmailProviderFactory } from './../src/communication/email-providers';
import { EmailWorker } from './../src/communication/email.worker';
import { EmailTemplatesService } from './../src/communication/email-templates.service';
import { MailService } from './../src/communication/mail.service';
import { Email } from './../src/communication/schemas/email.schema';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const spec = {
  title: 'Backend Engineer', location: 'Pune', workMode: 'HYBRID', employmentType: 'FULL_TIME', openings: 1,
  requirements: { experienceMin: 2, technicalSkills: ['Node.js'] }, compensation: { salaryMin: 100000, salaryMax: 200000, currency: 'INR' },
  details: { description: 'A role building services for our hiring platform team.', responsibilities: 'Build things.' },
};

describe('Notifications & email (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let emails: Model<Email>;
  let worker: EmailWorker;
  let providers: EmailProviderFactory;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>, cara: ReturnType<typeof request.agent>;
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const mailsTo = (to: string, template?: string) => emails.find({ to, ...(template ? { template } : {}) }).select('+html +text').sort({ createdAt: 1 }).lean();
  const notes = async (a: typeof admin, qs = '') => (await a.get(`/api/notifications?${qs}`).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit(); // the database was just wiped
    emails = moduleRef.get(getModelToken(Email.name));
    worker = moduleRef.get(EmailWorker);
    providers = moduleRef.get(EmailProviderFactory);
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Alice Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  it('seeds every default template', async () => {
    const list = (await admin.get('/api/email-templates').expect(200)).body.data;
    expect(list.length).toBeGreaterThanOrEqual(30);
    expect(list.map((t: any) => t.key)).toEqual(expect.arrayContaining(['welcome', 'job-approved', 'interview-scheduled', 'payslip-generated']));
  });

  describe('registration & recruiter approval', () => {
    it('welcomes a new candidate with a notification and a queued email', async () => {
      await reg('candidate', 'Cara Candidate', 'cara@t.dev');
      cara = await login('cara@t.dev');
      const [welcome] = await mailsTo('cara@t.dev', 'welcome');
      expect(welcome).toMatchObject({ status: 'QUEUED', subject: 'Welcome to Talentbridge', toName: 'Cara Candidate' });
      expect(welcome.html).toContain('Welcome aboard, Cara Candidate');
      expect(welcome.html).toContain('href="http');
      expect((await notes(cara)).data[0]).toMatchObject({ title: 'Welcome to Talentbridge', read: false, link: '/candidate/profile' });
    });

    it('tells every admin about a new recruiter, and the recruiter when approved', async () => {
      const r = await reg('recruiter', 'Rex Agent', 'rex@t.dev');
      ids.rex = r.body.data.user.id;
      expect((await notes(admin)).data.find((n: any) => n.title === 'New recruiter: Rex Agent')).toMatchObject({ link: '/admin/approvals', type: 'RECRUITMENT' });
      expect((await mailsTo('admin@t.dev', 'recruiter-registered-admin')).length).toBe(1);

      await admin.post(`/api/recruiters/${ids.rex}/approve`).send({}).expect(200);
      rex = await login('rex@t.dev');
      expect((await notes(rex)).data[0].title).toBe('Your recruiter account is approved');
      expect((await mailsTo('rex@t.dev', 'recruiter-account-approved')).length).toBe(1);
    });

    it('does not notify people about their own actions', async () => {
      const before = (await notes(admin)).meta.total;
      await admin.post(`/api/recruiters/${ids.rex}/suspend`).expect(200);
      await admin.post(`/api/recruiters/${ids.rex}/reactivate`).expect(200);
      expect((await notes(admin)).meta.total).toBe(before);
    });
  });

  describe('job & application workflow', () => {
    it('notifies and emails along the job request flow', async () => {
      ids.company = (await rex.post('/api/companies').send({ name: 'Acme' }).expect(201)).body.data.id;
      expect((await notes(admin)).data.some((n: any) => n.title === 'New company: Acme')).toBe(true);
      await admin.post(`/api/companies/${ids.company}/approve`).send({}).expect(200);
      expect((await notes(rex)).data[0].title).toBe('Acme: approved');

      ids.jr = (await rex.post('/api/job-requests').send({ companyId: ids.company, spec }).expect(201)).body.data.id;
      await rex.post(`/api/job-requests/${ids.jr}/submit`).expect(200);
      const adminNote = (await notes(admin)).data.find((n: any) => n.title === 'Job request: Backend Engineer');
      expect(adminNote).toMatchObject({ link: `/admin/job-requests/${ids.jr}` });
      expect((await mailsTo('admin@t.dev', 'job-submitted')).length).toBe(1);

      await admin.post(`/api/job-requests/${ids.jr}/request-changes`).send({ note: 'Clarify <b>salary</b>' }).expect(200);
      const [changes] = await mailsTo('rex@t.dev', 'job-changes-requested');
      expect(changes.subject).toBe('Changes requested: Backend Engineer');
      expect(changes.html).toContain('Clarify &lt;b&gt;salary&lt;/b&gt;'); // escaped, not injected
      expect(changes.html).toContain(`/recruiter/jobs/${ids.jr}`);

      await rex.post(`/api/job-requests/${ids.jr}/submit`).expect(200);
      ids.job = (await admin.post(`/api/job-requests/${ids.jr}/approve`).send({ commission: { type: 'PERCENT', percent: 10 } }).expect(200)).body.data.jobId;
      expect((await mailsTo('rex@t.dev', 'job-approved')).length).toBe(1);
    });

    it('emails candidate and admin on apply, then follows each status change', async () => {
      await cara.post('/api/candidates/me/resume').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
      const app1 = (await cara.post('/api/applications').send({ jobId: ids.job }).expect(201)).body.data;
      ids.app = app1.id;
      const [received] = await mailsTo('cara@t.dev', 'application-received');
      expect(received.html).toContain(app1.applicationNumber);
      expect((await mailsTo('admin@t.dev', 'application-received-admin')).length).toBe(1);

      const move = (status: string, extra: object = {}, who = admin) => who.patch(`/api/applications/${ids.app}/status`).send({ status, ...extra }).expect(200);
      await adminScreen(admin, conn, ids.app);
      expect((await mailsTo('cara@t.dev', 'application-shortlisted')).length).toBe(1);
      await move('SENT_TO_RECRUITER');
      expect((await mailsTo('rex@t.dev', 'candidate-sent-to-recruiter')).length).toBe(1);
      expect((await notes(rex)).data[0]).toMatchObject({ title: 'New candidate: Cara Candidate', link: `/recruiter/candidates/${ids.app}` });
      await move('RECRUITER_REVIEW', {}, rex);
      await move('ADMIN_REVIEW', { reason: 'Too expensive' }, rex);
      const [back] = await mailsTo('admin@t.dev', 'recruiter-rejected-candidate');
      expect(back.html).toContain('Too expensive');
      await move('REJECTED', { reason: 'Not a fit' });
      expect((await mailsTo('cara@t.dev', 'candidate-rejected')).length).toBe(1);
      expect((await notes(cara)).data[0].title).toBe('Update on Backend Engineer');
    });
  });

  describe('notification centre', () => {
    it('is private, counts unread, and marks read', async () => {
      const before = (await cara.get('/api/notifications/unread-count').expect(200)).body.data.count;
      expect(before).toBeGreaterThan(0);
      const first = (await notes(cara, 'unread=true&limit=1')).data[0];
      await cara.patch(`/api/notifications/${first.id}/read`).expect(200);
      expect((await cara.get('/api/notifications/unread-count')).body.data.count).toBe(before - 1);
      await rex.patch(`/api/notifications/${first.id}/read`).expect(404); // someone else's
      expect((await notes(cara, 'unread=true')).data.every((n: any) => !n.read)).toBe(true);
      await cara.post('/api/notifications/read-all').expect(200);
      expect((await cara.get('/api/notifications/unread-count')).body.data.count).toBe(0);
      expect((await notes(cara, 'type=SYSTEM')).data.every((n: any) => n.type === 'SYSTEM')).toBe(true);
      await request(app.getHttpServer()).get('/api/notifications').expect(401);
    });
  });

  describe('email delivery', () => {
    it('sends queued emails through the provider and marks them sent', async () => {
      const queued = await emails.countDocuments({ status: 'QUEUED' });
      expect(queued).toBeGreaterThan(5);
      expect(await worker.processOnce(100)).toBe(queued);
      expect(await emails.countDocuments({ status: 'QUEUED' })).toBe(0);
      const sent = await emails.findOne({ template: 'welcome' }).lean();
      expect(sent).toMatchObject({ status: 'SENT', provider: 'console', attempts: 1 });
      expect(sent!.providerMessageId).toBeTruthy();
    });

    it('scrubs bodies that carry one-time links once sent', async () => {
      await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'cara@t.dev' }).expect(200);
      const [queuedReset] = await mailsTo('cara@t.dev', 'password-reset');
      expect(queuedReset.html).toContain('reset-password?token=');
      await worker.processOnce();
      const [sent] = await mailsTo('cara@t.dev', 'password-reset');
      expect(sent).toMatchObject({ status: 'SENT', bodyRedacted: true });
      expect(sent.html).not.toContain('token=');
    });

    it('retries failures with backoff and gives up after four attempts', async () => {
      const original = providers.provider;
      (providers as any).provider = { name: 'broken', send: async () => { throw new Error('Provider unavailable'); } };
      try {
        await admin.post('/api/auth/forgot-password').send({ email: 'admin@t.dev' }).expect(200);
        const id = String((await emails.findOne({ to: 'admin@t.dev', template: 'password-reset' }).lean())!._id);
        for (let attempt = 1; attempt <= 4; attempt++) {
          await emails.updateOne({ _id: id }, { nextAttemptAt: new Date(Date.now() - 1000) });
          await worker.processOnce();
          const e = await emails.findById(id).lean();
          expect(e!.attempts).toBe(attempt);
          expect(e!.failureReason).toBe('Provider unavailable');
          if (attempt < 4) { expect(e!.status).toBe('QUEUED'); expect(+e!.nextAttemptAt).toBeGreaterThan(Date.now()); }
          else expect(e!.status).toBe('FAILED');
        }
        ids.failed = id;
      } finally {
        (providers as any).provider = original;
      }
    });

    it('holds scheduled emails until their time', async () => {
      const svc = app.get(MailService);
      await svc.send({ to: 'later@t.dev', toName: 'Later', template: 'welcome', vars: { link: 'https://x.test' }, sendAt: new Date(Date.now() + 3_600_000) });
      await worker.processOnce();
      expect((await emails.findOne({ to: 'later@t.dev' }).lean())!.status).toBe('QUEUED');
      expect((await admin.get('/api/emails?status=SCHEDULED')).body.meta.total).toBe(1);
    });

    it('lets Admin browse, inspect and retry emails', async () => {
      const failed = (await admin.get('/api/emails?status=FAILED').expect(200)).body;
      expect(failed.meta.total).toBe(1);
      expect(failed.data[0]).toMatchObject({ failureReason: 'Provider unavailable', attempts: 4 });
      expect(failed.data[0].html).toBeUndefined(); // list stays light

      const detail = (await admin.get(`/api/emails/${ids.failed}`).expect(200)).body.data;
      expect(detail.html).toContain('<html');
      expect(detail.events.map((e: any) => e.status)).toContain('FAILED');

      await admin.post(`/api/emails/${ids.failed}/retry`).expect(200);
      await worker.processOnce();
      expect((await admin.get(`/api/emails/${ids.failed}`)).body.data.status).toBe('SENT');
      await admin.post(`/api/emails/${ids.failed}/retry`).expect(409);

      const stats = (await admin.get('/api/emails/stats').expect(200)).body.data;
      expect(stats).toMatchObject({ failed: 0, scheduled: 1 });
      expect(stats.sent).toBeGreaterThan(5);
      expect((await admin.get('/api/emails?search=cara@t.dev&template=welcome')).body.meta.total).toBe(1);
      await cara.get('/api/emails').expect(403);
      await rex.get('/api/emails/stats').expect(403);
    });
  });

  describe('templates', () => {
    it('edits are saved, previewable, and can disable a template', async () => {
      const patch = await admin.patch('/api/email-templates/welcome').send({ subject: 'Hello {{name}}!' }).expect(200);
      expect(patch.body.data).toMatchObject({ subject: 'Hello {{name}}!', customised: true });
      const preview = (await admin.post('/api/email-templates/welcome/preview').send({ vars: { name: 'Zed' } }).expect(200)).body.data;
      expect(preview.subject).toBe('Hello Zed!');
      expect(preview.html).toContain('Welcome aboard, Zed');
      await admin.patch('/api/email-templates/nope').send({ subject: 'x' }).expect(404);
      await cara.patch('/api/email-templates/welcome').send({ subject: 'x' }).expect(403);

      await admin.patch('/api/email-templates/welcome').send({ enabled: false }).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const before = await emails.countDocuments({ to: 'dan@t.dev' });
      await reg('candidate', 'Dan', 'dan@t.dev');
      expect(await emails.countDocuments({ to: 'dan@t.dev' })).toBe(before + 1); // verification only, no welcome
    });
  });

  describe('Resend webhook', () => {
    const body = (id: string, type = 'email.delivered') => JSON.stringify({ type, data: { email_id: id } });
    const sign = (raw: string, ts = String(Math.floor(Date.now() / 1000)), id = 'msg_1') => ({
      'svix-id': id, 'svix-timestamp': ts,
      'svix-signature': 'v1,' + createHmac('sha256', Buffer.from('test-secret-key-0123456789')).update(`${id}.${ts}.${raw}`).digest('base64'),
    });

    it('updates delivery status for a signed event', async () => {
      const e = await emails.findOne({ template: 'welcome', status: 'SENT' }).lean();
      const raw = body(e!.providerMessageId!);
      await request(app.getHttpServer()).post('/api/webhooks/resend').set('content-type', 'application/json').set(sign(raw)).send(raw).expect(200);
      expect(await emails.findById(e!._id).lean()).toMatchObject({ status: 'DELIVERED' });

      const bounce = body(e!.providerMessageId!, 'email.bounced');
      await request(app.getHttpServer()).post('/api/webhooks/resend').set('content-type', 'application/json').set(sign(bounce)).send(bounce).expect(200);
      expect((await emails.findById(e!._id).lean())!.status).toBe('BOUNCED');
    });

    it('rejects bad, stale or missing signatures', async () => {
      const raw = body('x');
      const post = (h: Record<string, string>) => request(app.getHttpServer()).post('/api/webhooks/resend').set('content-type', 'application/json').set(h).send(raw);
      await post({}).expect(401);
      await post({ ...sign(raw), 'svix-signature': 'v1,AAAA' }).expect(401);
      await post(sign(raw, String(Math.floor(Date.now() / 1000) - 3600))).expect(401);
      await post(sign(raw + ' ')).expect(401); // body altered after signing
    });
  });
});
