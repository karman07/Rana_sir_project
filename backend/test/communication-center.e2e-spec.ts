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
import { configureApp } from './../src/app.setup';
import { EmailTemplatesService } from './../src/communication/email-templates.service';
import { Payment } from './../src/payments/schemas/payment.schema';
import { MailService } from './../src/communication/mail.service';
import { CommunicationListener } from './../src/communication/communication.listener';
import { EventBusService } from './../src/common/events/event-bus.service';
import { EmailTemplate } from './../src/communication/schemas/email-template.schema';
import { NotificationSetting } from './../src/communication/schemas/notification-setting.schema';
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





describe('Communication center (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let emails: Model<Email>, tpls: Model<EmailTemplate>, settings: Model<NotificationSetting>;
  let admin: ReturnType<typeof request.agent>, rex: ReturnType<typeof request.agent>;
  const cand: Record<string, ReturnType<typeof request.agent>> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => { const a = request.agent(app.getHttpServer()); await a.post('/api/auth/login').send({ email, password: PW }).expect(200); return a; };
  const reg = (kind: string, name: string, email: string) => request(app.getHttpServer()).post(`/api/auth/register/${kind}`).send({ name, email, password: PW }).expect(201);
  const notes = async (a: typeof admin) => (await a.get('/api/notifications?limit=100')).body.data as any[];
  const template = async (key: string) => ((await admin.get('/api/email-templates').expect(200)).body.data as any[]).find((t) => t.key === key);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    emails = moduleRef.get(getModelToken(Email.name)); tpls = moduleRef.get(getModelToken(EmailTemplate.name)); settings = moduleRef.get(getModelToken(NotificationSetting.name));
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin Person', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = await login('admin@t.dev');
    const r = await reg('recruiter', 'Rex Agent', 'rex@t.dev'); await admin.post(`/api/recruiters/${r.body.data.user.id}/approve`).send({}).expect(200);
    rex = await login('rex@t.dev');
    await reg('candidate', 'Cara Candidate', 'cara@t.dev'); cand.cara = await login('cara@t.dev');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('template editor', () => {
    it('is Admin-only', async () => {
      await rex.get('/api/email-templates').expect(403);
      await cand.cara.patch('/api/email-templates/payment-due').send({ subject: 'x' }).expect(403);
      await cand.cara.post('/api/email-templates/payment-due/test').expect(403);
      await request(app.getHttpServer()).get('/api/email-templates').expect(401);
    });

    it('ships a dedicated template for each payment and salary email, so editing one never changes another', async () => {
      for (const k of ['payment-due', 'payment-overdue', 'payment-confirmed', 'payment-attention', 'payout-sent', 'payslip-generated', 'salary-delayed']) expect(await template(k)).toMatchObject({ key: k, enabled: true });
    });

    it('previews with believable sample values, or with a draft that has not been saved', async () => {
      const saved = (await admin.post('/api/email-templates/payment-due/preview').send({}).expect(200)).body.data;
      expect(saved.subject).toBe('Payment due for October 2026');
      expect(saved.html).toContain('Priya Sharma');
      expect(saved.html).not.toContain('{{');
      const draft = (await admin.post('/api/email-templates/payment-due/preview').send({ subject: 'Heads up: {{period}}', body: '<p>Pay {{amountDue}} to us <script>alert(1)</script></p>' }).expect(200)).body.data;
      expect(draft.subject).toBe('Heads up: October 2026');
      expect(draft.html).toContain('$2,400.00');
      expect(draft.html).not.toMatch(/<script/i);
      expect((await template('payment-due')).subject).toBe('Payment due for {{period}}'); // nothing was saved
      expect((await admin.post('/api/email-templates/payment-due/preview').send({ vars: { candidateName: 'Zed' } })).body.data.html).toContain('Zed');
      await admin.post('/api/email-templates/nope/preview').send({}).expect(404);
    });

    it('saves an edit, marks the template as customised, and uses it from then on', async () => {
      const r = await admin.patch('/api/email-templates/payment-due').send({ subject: 'Please pay {{amountDue}} for {{period}}', heading: 'Payment due', body: '<p>Hi {{name}}, <strong>{{amountDue}}</strong> is due by {{dueDate}}.</p>' }).expect(200);
      expect(r.body.data).toMatchObject({ subject: 'Please pay {{amountDue}} for {{period}}', customised: true });
      expect((await template('payment-due')).customised).toBe(true);
      await emails.deleteMany({});
      await tpls.findOne({ key: 'payment-due' }); // cache is short-lived; update clears it
      const mail = app.get(MailService);
      await mail.send({ to: 'x@t.dev', toName: 'Xan', template: 'payment-due', vars: { amountDue: '₹9,000', period: '2026-10', dueDate: '5 Nov', candidateName: 'C', jobTitle: 'J' } });
      const sent = await emails.findOne({ to: 'x@t.dev' }).select('+html').lean();
      expect(sent!.subject).toBe('Please pay ₹9,000 for 2026-10');
      expect(sent!.html).toContain('Hi Xan');
    });

    it('refuses empty wording and placeholders the email is not sent with', async () => {
      await admin.patch('/api/email-templates/payment-due').send({ subject: '   ' }).expect(400);
      await admin.patch('/api/email-templates/payment-due').send({ body: '' }).expect(400);
      const r = await admin.patch('/api/email-templates/payment-due').send({ subject: 'Hello {{recipientNickname}}' }).expect(400);
      expect(r.body.error.code).toBe('UNKNOWN_VARIABLE');
      expect(r.body.error.message).toContain('{{recipientNickname}}');
      await admin.patch('/api/email-templates/nope').send({ subject: 'x' }).expect(404);
    });

    it('strips anything that could run from the saved wording', async () => {
      await admin.patch('/api/email-templates/payment-due').send({
        body: '<p onclick="steal()">Hi {{name}}</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">Pay</a><img src=x onerror=alert(1)><p><a href="https://ok.test">fine</a></p>',
      }).expect(200);
      const saved = (await template('payment-due')).body as string;
      expect(saved).not.toMatch(/<script|<iframe|onclick|onerror|javascript:/i);
      expect(saved).toContain('https://ok.test');
      expect(saved).toContain('Hi {{name}}');
    });

    it('can be put back to the original wording', async () => {
      const r = await admin.post('/api/email-templates/payment-due/reset').expect(200);
      expect(r.body.data).toMatchObject({ subject: 'Payment due for {{period}}', customised: false });
      expect((await template('payment-due')).body).toContain('Please pay, then record it');
      await admin.post('/api/email-templates/nope/reset').expect(404);
    });

    it('sends a test to the Admin who asked, even when the template is switched off', async () => {
      await emails.deleteMany({});
      const r = await admin.post('/api/email-templates/payout-sent/test').expect(200);
      expect(r.body.data).toEqual({ sent: true, to: 'admin@t.dev' });
      const mail = await emails.findOne({ to: 'admin@t.dev', template: 'payout-sent' }).lean();
      expect(mail).toBeTruthy();
      expect(mail!.subject).toBe('Your October 2026 pay was sent');
      await admin.patch('/api/email-templates/payout-sent').send({ enabled: false }).expect(200);
      expect((await admin.post('/api/email-templates/payout-sent/test').expect(200)).body.data.sent).toBe(true);
      await admin.patch('/api/email-templates/payout-sent').send({ enabled: true }).expect(200);
    });

    it('a switched-off template sends nothing', async () => {
      await admin.patch('/api/email-templates/payment-overdue').send({ enabled: false }).expect(200);
      await emails.deleteMany({});
      expect(await app.get(MailService).send({ to: 'x@t.dev', template: 'payment-overdue', vars: {} })).toBeNull();
      expect(await emails.countDocuments({})).toBe(0);
      await admin.patch('/api/email-templates/payment-overdue').send({ enabled: true }).expect(200);
    });
  });

  describe('delivery status', () => {
    it('shows how email is set up without revealing any key, to Admin only', async () => {
      await rex.get('/api/emails/status').expect(403);
      const s = (await admin.get('/api/emails/status').expect(200)).body.data;
      expect(s).toMatchObject({ provider: 'console', live: false, worker: 'off', webhookSigned: true });
      expect(s.fromAddress).toContain('@');
      expect(JSON.stringify(s)).not.toMatch(/re_[A-Za-z0-9]{10}|api.?key|secret/i);
    });
  });

  describe('notification settings', () => {
    it('lists every event that can notify someone, grouped, all on by default, Admin only', async () => {
      await rex.get('/api/notification-settings').expect(403);
      const list = (await admin.get('/api/notification-settings').expect(200)).body.data as any[];
      expect(list.length).toBeGreaterThan(50);
      expect(new Set(list.map((x) => x.group))).toEqual(new Set(['Accounts', 'Applications & candidates', 'Companies', 'Contracts', 'Interviews', 'Jobs', 'Payments', 'Salary & payslips', 'Website']));
      expect(list.every((x) => x.inApp && x.email)).toBe(true);
      expect(list.find((x) => x.event === 'PAYMENT_OVERDUE')).toMatchObject({ label: 'Payment is late', group: 'Payments' });
      expect(list.find((x) => x.event === 'PASSWORD_RESET')).toMatchObject({ locked: true });
    });

    it('turns the email off for an event while keeping the in-app notice', async () => {
      const r = await admin.patch('/api/notification-settings/CONTRACT_ACTIVATED').send({ email: false }).expect(200);
      expect(r.body.data).toMatchObject({ event: 'CONTRACT_ACTIVATED', inApp: true, email: false });
      expect((await settings.findOne({ event: 'CONTRACT_ACTIVATED' }).lean())).toMatchObject({ email: false, inApp: true });
      expect(app.get(CommunicationListener)).toBeTruthy();
    });

    it('is applied to real events: no email, but the notification still arrives', async () => {
      await emails.deleteMany({});
      const bus = app.get(EventBusService);
      const candId = (await conn.collection('users').findOne({ email: 'cara@t.dev' }))!._id.toString();
      const fire = () => bus.publish('PAYSLIP_GENERATED' as never, { actor: { id: null, role: 'SYSTEM' }, entity: { type: 'Payslip', id: '65f000000000000000000001' }, data: { payslipId: '65f000000000000000000001', payslipNumber: 'PSL-9', period: '2026-10', candidateId: candId, jobTitle: 'Designer' } });
      await admin.patch('/api/notification-settings/PAYSLIP_GENERATED').send({ email: false }).expect(200);
      await fire();
      expect((await notes(cand.cara)).some((n) => n.title === 'Your 2026-10 payslip is ready')).toBe(true);
      expect(await emails.countDocuments({ to: 'cara@t.dev', template: 'payslip-generated' })).toBe(0);
      // both off: nothing at all
      await admin.patch('/api/notification-settings/PAYSLIP_GENERATED').send({ inApp: false }).expect(200);
      const before = (await notes(cand.cara)).length;
      await fire();
      expect((await notes(cand.cara)).length).toBe(before);
      expect(await emails.countDocuments({ to: 'cara@t.dev', template: 'payslip-generated' })).toBe(0);
      // back on: both arrive
      await admin.patch('/api/notification-settings/PAYSLIP_GENERATED').send({ inApp: true, email: true }).expect(200);
      await fire();
      expect((await notes(cand.cara)).length).toBe(before + 1);
      expect(await emails.countDocuments({ to: 'cara@t.dev', template: 'payslip-generated' })).toBe(1);
    });

    it('refuses unknown events and the ones that must always be sent', async () => {
      await admin.patch('/api/notification-settings/NOT_A_THING').send({ email: false }).expect(404);
      const r = await admin.patch('/api/notification-settings/PASSWORD_RESET').send({ email: false }).expect(400);
      expect(r.body.error.code).toBe('LOCKED');
      await admin.patch('/api/notification-settings/CONTRACT_ACTIVATED').send({ email: 'no' }).expect(400);
      await rex.patch('/api/notification-settings/CONTRACT_ACTIVATED').send({ email: true }).expect(403);
    });

    it('records the change in the audit trail by who made it', async () => {
      const stored = await settings.findOne({ event: 'CONTRACT_ACTIVATED' }).lean();
      expect(stored!.updatedBy).toBeTruthy();
    });
  });
});
