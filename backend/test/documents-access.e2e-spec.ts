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
import { createHmac } from 'node:crypto';
import { DocumentFile } from './../src/documents/schemas/document.schema';
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





const sign = (payload: string) => createHmac('sha256', `documents:${process.env.JWT_ACCESS_SECRET ?? 'dev-only-jwt_access_secret'}`).update(payload).digest('base64url');
const link = (d: object) => { const p = Buffer.from(JSON.stringify(d)).toString('base64url'); return `${p}.${sign(p)}`; };
const bin = (r: any, cb: any) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); };

describe('Documents: contract paperwork, access & signed links (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let docsM: Model<DocumentFile>;
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
  const mine = async (a: typeof admin) => (await a.get('/api/documents').expect(200)).body.data as any[];
  const download = (a: typeof admin, id: string) => a.get(`/api/documents/${id}/download`).buffer(true).parse(bin);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(EmailTemplatesService).onModuleInit();
    docsM = moduleRef.get(getModelToken(DocumentFile.name));
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
    await selected('dan', 'Dan Candidate');
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  describe('offer letter', () => {
    it('is issued to the candidate when the contract is put to them, and to no one else', async () => {
      const r = await rex.post('/api/contracts').send({ applicationId: ids.cara, ...terms({ salaryAmount: 10_000_000, salaryPeriod: 'MONTH', startDate: day(10) }) }).expect(201);
      ids.contract = r.body.data.id;
      await rex.post(`/api/contracts/${ids.contract}/submit`).expect(200);
      expect((await mine(cand.cara)).filter((d) => d.type === 'OFFER_LETTER')).toHaveLength(0); // not yet put to them
      await admin.post(`/api/contracts/${ids.contract}/approve`).send({}).expect(200);
      const offers = (await mine(cand.cara)).filter((d) => d.type === 'OFFER_LETTER');
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({ mime: 'application/pdf', status: 'ACTIVE', version: 1, related: { type: 'Contract', id: ids.contract } });
      expect(offers[0].label).toMatch(/Offer letter CON-0001/);
      ids.offer = offers[0].id;
      const pdf = await download(cand.cara, ids.offer).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((await mine(rex)).filter((d) => d.type === 'OFFER_LETTER')).toHaveLength(0);
    });

    it('cannot be opened by a recruiter, another candidate, or a stranger', async () => {
      await download(rex, ids.offer).expect(404); // their candidate's copy states the candidate's own pay
      await download(ron, ids.offer).expect(404);
      await download(cand.dan, ids.offer).expect(404);
      await request(app.getHttpServer()).get(`/api/documents/${ids.offer}/download`).expect(401);
      await download(admin, ids.offer).expect(200);
    });
  });

  describe('contract copies', () => {
    it('go to both sides when the contract takes effect, each their own', async () => {
      await cand.cara.post(`/api/contracts/${ids.contract}/approve`).send({}).expect(200);
      const c = (await mine(cand.cara)).filter((d) => d.type === 'CONTRACT');
      const r = (await mine(rex)).filter((d) => d.type === 'CONTRACT');
      expect(c).toHaveLength(1); expect(r).toHaveLength(1);
      expect(c[0].label).toBe('Contract CON-0001 · v1');
      expect(r[0].label).toBe('Contract CON-0001 · v1 · company copy');
      ids.candCopy = c[0].id; ids.coCopy = r[0].id;
      expect((await mine(ron)).filter((d) => d.type === 'CONTRACT')).toHaveLength(0);
      expect((await mine(cand.dan)).filter((d) => d.type === 'CONTRACT' || d.type === 'OFFER_LETTER')).toHaveLength(0);
    });

    it('are only ever opened by their own reader and Admin', async () => {
      await download(cand.cara, ids.candCopy).expect(200);
      await download(rex, ids.coCopy).expect(200);
      await download(admin, ids.candCopy).expect(200);
      await download(admin, ids.coCopy).expect(200);
      await download(rex, ids.candCopy).expect(404); // never the candidate's copy
      await download(cand.cara, ids.coCopy).expect(404); // never the company's
      await download(ron, ids.coCopy).expect(404);
      await download(ron, ids.candCopy).expect(404);
      await download(cand.dan, ids.candCopy).expect(404);
      await download(cand.dan, ids.coCopy).expect(404);
    });

    it('appear on the contract page, filtered to what that person may open', async () => {
      const names = async (a: typeof admin) => (await a.get(`/api/contracts/${ids.contract}`)).body.data.documents.map((d: any) => d.label).sort();
      expect(await names(cand.cara)).toEqual(['Contract CON-0001 · v1', 'Offer letter CON-0001 · v1']);
      expect(await names(rex)).toEqual(['Contract CON-0001 · v1 · company copy']);
      expect(await names(admin)).toEqual(['Contract CON-0001 · v1', 'Contract CON-0001 · v1 · company copy', 'Offer letter CON-0001 · v1']);
    });

    it('keep every earlier version, archived, when the contract changes', async () => {
      await admin.post(`/api/contracts/${ids.contract}/versions`).send({ salaryAmount: 12_000_000, reason: 'Raise' }).expect(201);
      const all = await docsM.find({ type: 'CONTRACT' }).sort({ version: 1 }).lean();
      expect(all.map((d) => [d.version, d.status])).toEqual([[1, 'ARCHIVED'], [1, 'ARCHIVED'], [2, 'ACTIVE'], [2, 'ACTIVE']]);
      const c = (await mine(cand.cara)).filter((d) => d.type === 'CONTRACT');
      expect(c.map((d) => [d.version, d.status]).sort()).toEqual([[1, 'ARCHIVED'], [2, 'ACTIVE']]);
      await download(cand.cara, ids.candCopy).expect(200); // the old one still opens
    });
  });

  describe('signed links', () => {
    it('open a file for a few minutes without any cookie', async () => {
      const r = await cand.cara.post(`/api/documents/${ids.candCopy}/link`).send({ inline: true }).expect(200);
      expect(r.body.data.expiresInSeconds).toBe(300);
      const res = await request(app.getHttpServer()).get(`/api${r.body.data.path}`).buffer(true).parse(bin).expect(200); // no cookie
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^inline/);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('are refused for a file the person could not open anyway', async () => {
      await cand.cara.post(`/api/documents/${ids.coCopy}/link`).send({}).expect(404);
      await rex.post(`/api/documents/${ids.candCopy}/link`).send({}).expect(404);
      await request(app.getHttpServer()).post(`/api/documents/${ids.candCopy}/link`).send({}).expect(401);
    });

    it('are rejected when tampered with, expired, or malformed', async () => {
      const r = await cand.cara.post(`/api/documents/${ids.candCopy}/link`).send({}).expect(200);
      const t = new URL(`http://x${r.body.data.path}`).searchParams.get('t')!;
      const [p, s] = t.split('.');
      await request(app.getHttpServer()).get(`/api/documents/signed?t=${p}.${s.slice(0, -2)}AA`).expect(403); // altered signature
      const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), d: ids.coCopy })).toString('base64url');
      await request(app.getHttpServer()).get(`/api/documents/signed?t=${forged}.${s}`).expect(403); // another file, same signature
      const expired = await request(app.getHttpServer()).get(`/api/documents/signed?t=${link({ d: ids.candCopy, u: 'x', i: 0, e: Math.floor(Date.now() / 1000) - 5 })}`).expect(403);
      expect(expired.body.error.code).toBe('LINK_EXPIRED');
      await request(app.getHttpServer()).get('/api/documents/signed').expect(403);
      await request(app.getHttpServer()).get('/api/documents/signed?t=garbage').expect(403);
    });

    it('are bound to the person they were issued to, and checked again on use', async () => {
      const owner = (await docsM.findById(ids.candCopy).lean())!.ownerId;
      // a correctly signed link naming someone who may not read the file is still refused
      const ron_ = (await conn.collection('users').findOne({ email: 'ron@t.dev' }))!;
      await request(app.getHttpServer()).get(`/api/documents/signed?t=${link({ d: ids.candCopy, u: String(ron_._id), i: 0, e: Math.floor(Date.now() / 1000) + 300 })}`).expect(404);
      // and a suspended person's link stops working
      const r = await cand.cara.post(`/api/documents/${ids.candCopy}/link`).send({}).expect(200);
      await conn.collection('users').updateOne({ _id: owner }, { $set: { status: 'SUSPENDED' } });
      await request(app.getHttpServer()).get(`/api${r.body.data.path}`).expect(403);
      await conn.collection('users').updateOne({ _id: owner }, { $set: { status: 'ACTIVE' } });
      await request(app.getHttpServer()).get(`/api${r.body.data.path}`).expect(200);
    });
  });

  describe('Admin view', () => {
    it('lists every file with its owner, filterable, and only to Admin', async () => {
      await rex.get('/api/documents/all').expect(403);
      await cand.cara.get('/api/documents/all').expect(403);
      const all = (await admin.get('/api/documents/all?limit=100').expect(200)).body;
      expect(all.meta.total).toBe(7); // two resumes, one offer letter, and four contract copies (two versions, two readers)
      expect(all.data[0].owner).toMatchObject({ name: expect.any(String), role: expect.any(String) });
      const contracts = (await admin.get('/api/documents/all?type=CONTRACT&limit=100')).body.data;
      expect(contracts.every((d: any) => d.type === 'CONTRACT')).toBe(true);
      expect(contracts).toHaveLength(4);
      expect((await admin.get('/api/documents/all?status=ARCHIVED&type=CONTRACT')).body.data).toHaveLength(2);
      expect((await admin.get(`/api/documents/all?ownerId=${(await docsM.findById(ids.coCopy).lean())!.ownerId}&type=CONTRACT`)).body.data.every((d: any) => d.owner.name === 'Rex Agent')).toBe(true);
      expect((await admin.get('/api/documents/all?search=company%20copy')).body.data.length).toBeGreaterThan(0);
      await admin.get('/api/documents/all?type=BOGUS').expect(400);
    });
  });

  describe('candidate privacy', () => {
    it('shows each candidate only their own files, across every kind', async () => {
      await cand.dan.post('/api/documents').field('type', 'IDENTIFICATION').field('label', 'Passport').attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' }).expect(201);
      const danDocs = await mine(cand.dan);
      const caraDocs = await mine(cand.cara);
      expect(danDocs.map((d) => d.type).sort()).toEqual(['IDENTIFICATION', 'RESUME']);
      expect(caraDocs.some((d) => d.label === 'Passport')).toBe(false);
      for (const d of danDocs) await download(cand.cara, d.id).expect(404);
      for (const d of caraDocs) await download(cand.dan, d.id).expect(404);
      for (const d of [...danDocs, ...caraDocs]) await download(ron, d.id).expect(404); // an unrelated recruiter sees none of it
    });
  });
});
