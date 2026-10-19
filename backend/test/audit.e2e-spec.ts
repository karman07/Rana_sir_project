import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuditService, redact } from './../src/audit/audit.service';
import { AuditLog } from './../src/audit/schemas/audit-log.schema';
import { MailService } from './../src/common/mail/mail.service';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';

describe('Audit log (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let model: Model<AuditLog>;
  let audit: AuditService;
  let admin: ReturnType<typeof request.agent>;
  let recruiterId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async () => undefined }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    model = moduleRef.get(getModelToken(AuditLog.name));
    audit = moduleRef.get(AuditService);
    await moduleRef.get(UsersService).create({ email: 'admin@test.dev', name: 'Alice Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/login').send({ email: 'admin@test.dev', password: PW }).expect(200);
    const rex = await request(app.getHttpServer()).post('/api/auth/register/recruiter').send({ name: 'Rex Agent', email: 'rex@agency.dev', password: PW }).expect(201);
    recruiterId = rex.body.data.user.id;
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
  });

  it('records registration and admin decisions with actor, entity and before/after state', async () => {
    await admin.post(`/api/recruiters/${recruiterId}/approve`).send({ note: 'Looks good' }).expect(200);
    const res = await admin.get(`/api/audit-logs?entityType=RecruiterProfile&entityId=${recruiterId}&sort=createdAt`).expect(200);
    const actions = res.body.data.map((l: any) => l.action);
    expect(actions).toEqual(['RECRUITER_REGISTERED', 'RECRUITER_ACCOUNT_APPROVED']);

    const approved = res.body.data[1];
    expect(approved).toMatchObject({
      actorRole: 'ADMIN', actorName: 'Alice Admin', reason: 'Looks good',
      previousState: { approvalStatus: 'PENDING_REVIEW' }, newState: { approvalStatus: 'APPROVED' },
    });
    expect(res.body.data[0]).toMatchObject({ actorRole: 'RECRUITER', actorName: 'Rex Agent' });
  });

  it('audits suspension and filters by action', async () => {
    await admin.post(`/api/recruiters/${recruiterId}/suspend`).expect(200);
    const res = await admin.get('/api/audit-logs?action=USER_SUSPENDED').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ entityType: 'User', entityId: recruiterId, newState: { status: 'SUSPENDED' } });
    expect((await admin.get('/api/audit-logs/actions').expect(200)).body.data).toContain('USER_SUSPENDED');
  });

  it('supports text search and date ranges', async () => {
    expect((await admin.get('/api/audit-logs?search=rex').expect(200)).body.meta.total).toBeGreaterThan(0);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await admin.get(`/api/audit-logs?from=${future}`).expect(200)).body.meta.total).toBe(0);
    await admin.get('/api/audit-logs?from=notadate').expect(400);
  });

  it('is admin only', async () => {
    const rex = request.agent(app.getHttpServer());
    await request(app.getHttpServer()).get('/api/audit-logs').expect(401);
    const cand = await request(app.getHttpServer()).post('/api/auth/register/candidate').send({ name: 'Cara', email: 'cara@test.dev', password: PW });
    const c = request.agent(app.getHttpServer());
    await c.post('/api/auth/login').send({ email: 'cara@test.dev', password: PW }).expect(200);
    await c.get('/api/audit-logs').expect(403);
    expect(rex).toBeDefined();
    expect(cand.status).toBe(201);
  });

  it('is immutable: updates and deletes are rejected', async () => {
    const doc = await model.findOne().exec();
    await expect(model.updateOne({ _id: doc!._id }, { action: 'TAMPERED' }).exec()).rejects.toThrow(/immutable/);
    await expect(model.deleteMany({}).exec()).rejects.toThrow(/immutable/);
    await expect(model.findOneAndDelete({ _id: doc!._id }).exec()).rejects.toThrow(/immutable/);
    doc!.action = 'TAMPERED';
    await expect(doc!.save()).rejects.toThrow(/immutable/);
    expect((await model.findById(doc!._id).lean())!.action).not.toBe('TAMPERED');
  });

  it('redacts credentials before persisting', async () => {
    await audit.record({
      actor: { id: null, role: 'SYSTEM' }, action: 'TEST_REDACT', entity: { type: 'X', id: '1' },
      newState: { name: 'ok', passwordHash: 'abc', nested: { refreshToken: 'zzz', fine: 1 } },
    });
    const doc = await model.findOne({ action: 'TEST_REDACT' }).lean();
    expect(doc!.newState).toEqual({ name: 'ok', passwordHash: '[redacted]', nested: { refreshToken: '[redacted]', fine: 1 } });
    expect(redact({ a: [{ secret: 1 }] })).toEqual({ a: [{ secret: '[redacted]' }] });
  });
});
