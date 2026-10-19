import { Test } from '@nestjs/testing';
import { Body, Controller, Get, INestApplication, Module, Post, Query } from '@nestjs/common';
import { MongooseModule, Prop, Schema, SchemaFactory, InjectModel } from '@nestjs/mongoose';
import { IsString, MinLength } from 'class-validator';
import type { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { BaseEntity } from './../src/common/database/base.schema';
import { paginate } from './../src/common/database/paginate';
import { Public } from './../src/auth/decorators';
import { PaginationQueryDto } from './../src/common/dto/pagination-query.dto';

@Schema({ timestamps: true, collection: 'e2e_things' })
class Thing extends BaseEntity {
  @Prop({ required: true }) name: string;
}
const ThingSchema = SchemaFactory.createForClass(Thing);

class CreateThingDto {
  @IsString() @MinLength(2) name: string;
}

@Controller('things')
@Public()
class ThingsController {
  constructor(@InjectModel(Thing.name) private model: Model<Thing>) {}
  @Post() create(@Body() dto: CreateThingDto) { return this.model.create(dto); }
  @Get() list(@Query() q: PaginationQueryDto) {
    return paginate(this.model, {}, q, { sortable: ['name', 'createdAt'], searchFields: ['name'] });
  }
  @Get('boom') boom() { throw new Error('secret internals'); }
}

@Module({ imports: [MongooseModule.forFeature([{ name: Thing.name, schema: ThingSchema }])], controllers: [ThingsController] })
class ThingsModule {}

describe('Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let model: Model<Thing>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ThingsModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    model = moduleRef.get(`${Thing.name}Model`);
    expect(model.db.name).toContain('e2e');
    await model.collection.deleteMany({});
  });

  afterAll(async () => {
    await model.collection.drop().catch(() => undefined);
    await app.close();
  });

  it('health reports db up inside the response envelope', () =>
    request(app.getHttpServer()).get('/api/health').expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ success: true, data: { status: 'ok', db: 'up' } });
    }));

  it('unknown route returns the error envelope', () =>
    request(app.getHttpServer()).get('/api/nope').expect(404).expect(({ body }) => {
      expect(body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    }));

  it('validation errors are structured and unknown fields rejected', () =>
    request(app.getHttpServer()).post('/api/things').send({ name: 'x', extra: 1 }).expect(400).expect(({ body }) => {
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.error.details)).toBe(true);
    }));

  it('hides internal error details on 500', () =>
    request(app.getHttpServer()).get('/api/things/boom').expect(500).expect(({ body }) => {
      expect(body.error.message).toBe('Something went wrong');
    }));

  it('paginates, sorts, searches and soft-deletes', async () => {
    const http = request(app.getHttpServer());
    for (const name of ['alpha', 'bravo', 'charlie', 'alpine']) await http.post('/api/things').send({ name }).expect(201);
    const page = await http.get('/api/things?limit=2&sort=name').expect(200);
    expect(page.body.data.map((t: Thing) => t.name)).toEqual(['alpha', 'alpine']);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 2, total: 4, totalPages: 2 });

    const found = await http.get('/api/things?search=ALP').expect(200);
    expect(found.body.meta.total).toBe(2);

    await model.updateOne({ name: 'bravo' }, { deletedAt: new Date() });
    const after = await http.get('/api/things?limit=100').expect(200);
    expect(after.body.meta.total).toBe(3);
    expect(await model.countDocuments({}, { withDeleted: true } as any)).toBe(4);
  });

  it('strips mongo operators from query input', async () => {
    const res = await request(app.getHttpServer()).get('/api/things?search[$ne]=x').expect(400);
    expect(res.body.success).toBe(false);
  });

  it('sets security headers', () =>
    request(app.getHttpServer()).get('/api/health').expect('x-content-type-options', 'nosniff'));
});
