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
import { configureApp } from './../src/app.setup';
import { DEFAULT_SITE_CONTENT } from './../src/site-content/site-content.defaults';
import { UsersService } from './../src/users/users.service';

const PW = 'Sup3rSecret!';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const clone = () => JSON.parse(JSON.stringify(DEFAULT_SITE_CONTENT));

describe('Admin-managed website content (e2e)', () => {
  let app: INestApplication<App>;
  let conn: Connection;
  let admin: ReturnType<typeof request.agent>, cara: ReturnType<typeof request.agent>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    conn = moduleRef.get(getConnectionToken());
    expect(conn.name).toContain('e2e');
    await conn.dropDatabase();
    await moduleRef.get(UsersService).create({ email: 'admin@t.dev', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PW, 4), emailVerified: true });
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/login').send({ email: 'admin@t.dev', password: PW }).expect(200);
    await http().post('/api/auth/register/candidate').send({ name: 'Cara', email: 'cara@t.dev', password: PW }).expect(201);
    cara = request.agent(app.getHttpServer());
    await cara.post('/api/auth/login').send({ email: 'cara@t.dev', password: PW }).expect(200);
  });

  afterAll(async () => {
    if (conn.name.includes('e2e')) await conn.dropDatabase();
    await app.close();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  });

  it('serves sensible defaults to anyone, with no invented customers', async () => {
    const res = await http().get('/api/public/site').expect(200);
    expect(res.body.data.hero.headline).toBe(DEFAULT_SITE_CONTENT.hero.headline);
    expect(res.body.data.trustedBy).toMatchObject({ enabled: false, companies: [] });
    expect(res.body.data.testimonials.items).toEqual([]);
  });

  it('only Admin can read or change the editable content', async () => {
    await http().put('/api/site-content').send(clone()).expect(401);
    await cara.get('/api/site-content').expect(403);
    await cara.put('/api/site-content').send(clone()).expect(403);
    await cara.post('/api/site-content/assets').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(403);
  });

  it('saves changes that the public site then shows (and audits them)', async () => {
    const c = clone();
    c.hero.headline = 'Hire the best. Get hired by the best.';
    c.quickLinks = [{ label: 'Cloud', query: 'AWS' }];
    c.trustedBy = { enabled: true, label: 'Our clients:', companies: [{ name: 'Acme Corp', logo: '', url: 'https://acme.test' }, { name: 'Globex', logo: '/api/public/assets/' + 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12) + '.png', url: '' }] };
    c.testimonials = { enabled: true, title: 'Kind words', items: [{ quote: 'Great service.', name: 'Pat', role: 'HR Lead', company: 'Acme Corp' }] };
    c.contact.email = 'hello@talentbridge.test';
    await admin.put('/api/site-content').send(c).expect(200);

    const pub = (await http().get('/api/public/site').expect(200)).body.data;
    expect(pub.hero.headline).toBe('Hire the best. Get hired by the best.');
    expect(pub.quickLinks).toEqual([{ label: 'Cloud', query: 'AWS' }]);
    expect(pub.trustedBy.companies.map((x: any) => x.name)).toEqual(['Acme Corp', 'Globex']);
    expect(pub.contact.email).toBe('hello@talentbridge.test');
    expect(pub.faqs.length).toBe(DEFAULT_SITE_CONTENT.faqs.length); // untouched sections keep their content

    const log = (await admin.get('/api/audit-logs?action=SITE_CONTENT_UPDATED').expect(200)).body.data;
    expect(log[0]).toMatchObject({ actorRole: 'ADMIN', newState: { heroHeadline: 'Hire the best. Get hired by the best.', companies: 2 } });
  });

  it('rejects unsafe or oversized content', async () => {
    const bad = (mut: (c: any) => void) => { const c = clone(); mut(c); return admin.put('/api/site-content').send(c).expect(400); };
    await bad((c) => { c.hero.backgroundImage = 'javascript:alert(1)'; });
    await bad((c) => { c.trustedBy.companies = [{ name: 'X', logo: 'data:text/html;base64,AAAA', url: '' }]; });
    await bad((c) => { c.announcement.linkUrl = 'ftp://x'; });
    await bad((c) => { c.trustedBy.companies = Array.from({ length: 13 }, (_, i) => ({ name: `C${i}`, logo: '', url: '' })); });
    await bad((c) => { c.hero.overlayStrength = 5; });
    await bad((c) => { c.hero.headline = 'x'.repeat(200); });
    await bad((c) => { c.featuredJobs.count = 100; });
    await bad((c) => { c.unknown = 1; });
  });

  describe('image uploads', () => {
    it('accepts genuine PNG/JPG/WebP only', async () => {
      await admin.post('/api/site-content/assets').expect(400);
      await admin.post('/api/site-content/assets').attach('file', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(400);
      await admin.post('/api/site-content/assets').attach('file', Buffer.from('not really a png'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
      await admin.post('/api/site-content/assets').attach('file', Buffer.from('<html></html>'), { filename: 'x.html', contentType: 'text/html' }).expect(400);
    });

    it('stores a valid image under a random name and serves it publicly with safe headers', async () => {
      const up = await admin.post('/api/site-content/assets').attach('file', PNG, { filename: 'Logo Final.PNG', contentType: 'image/png' }).expect(201);
      expect(up.body.data.url).toMatch(/^\/api\/public\/assets\/[a-f0-9-]{36}\.png$/);
      expect(up.body.data.url).not.toContain('Logo');
      const img = await http().get(up.body.data.url).expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      expect(img.headers['cache-control']).toContain('immutable');
      expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(img.headers['x-content-type-options']).toBe('nosniff');
    });

    it('does not serve anything that is not one of our asset names', async () => {
      await http().get('/api/public/assets/..%2f..%2f.env').expect(404);
      await http().get('/api/public/assets/passwd').expect(404);
      await http().get('/api/public/assets/00000000-0000-0000-0000-000000000000.png').expect(404);
      await http().get('/api/public/assets/00000000-0000-0000-0000-000000000000.svg').expect(404);
    });
  });
});
