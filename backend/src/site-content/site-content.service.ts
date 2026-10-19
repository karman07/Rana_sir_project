import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { DomainEvent, Role } from '@rms/shared';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { DEFAULT_SITE_CONTENT, type SiteContent } from './site-content.defaults';

@Schema({ timestamps: true, collection: 'sitecontent' })
export class SiteContentDoc {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ type: Object, required: true }) data: SiteContent;
  @Prop() updatedBy?: string;
}
export const SiteContentSchema = SchemaFactory.createForClass(SiteContentDoc);

/** Public images (logos, hero background): only raster formats, checked by their real bytes. */
const IMAGE_TYPES: Record<string, { ext: string; mime: string; magic: (b: Buffer) => boolean }> = {
  png: { ext: 'png', mime: 'image/png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  jpg: { ext: 'jpg', mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { ext: 'webp', mime: 'image/webp', magic: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
};
export const ASSET_NAME = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

const merge = <T>(base: T, over: unknown): T => {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (over === undefined || over === null ? base : over) as T;
  const o = (over ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) if (k in o) out[k] = merge((base as Record<string, unknown>)[k], o[k]);
  return out as T;
};

@Injectable()
export class SiteContentService {
  constructor(
    @InjectModel(SiteContentDoc.name) private readonly model: Model<SiteContentDoc>,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventBusService,
  ) {}

  private get assetDir() { return join(resolve(this.config.get('UPLOAD_DIR')), 'public'); }

  /** Stored content layered over the defaults, so newly added fields always have a value. */
  async get(): Promise<SiteContent> {
    const doc = await this.model.findOne({ key: 'landing' }).lean();
    return merge(DEFAULT_SITE_CONTENT, doc?.data);
  }

  async update(dto: SiteContent, admin: AuthUser) {
    const previous = await this.get();
    const { note: _note, ...data } = dto as SiteContent & { note?: string };
    await this.model.updateOne({ key: 'landing' }, { $set: { data, updatedBy: admin.id } }, { upsert: true });
    await this.events.publish(DomainEvent.SITE_CONTENT_UPDATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'SiteContent', id: 'landing' },
      previousState: { heroHeadline: previous.hero.headline, companies: previous.trustedBy.companies.length, categories: previous.categories.items.length },
      newState: { heroHeadline: data.hero.headline, companies: data.trustedBy.companies.length, categories: data.categories.items.length },
    });
    return this.get();
  }

  /** Stores an image from a multer temp file under a random name; returns the public URL path. */
  async storeAsset(file: { path: string; originalname: string; size: number }) {
    const ext = file.originalname.split('.').pop()?.toLowerCase().replace('jpeg', 'jpg') ?? '';
    const kind = IMAGE_TYPES[ext];
    let ok = false;
    if (kind) {
      const fh = await open(file.path, 'r');
      try { const buf = Buffer.alloc(12); await fh.read(buf, 0, 12, 0); ok = kind.magic(buf); } finally { await fh.close(); }
    }
    if (!kind || !ok || file.size > MAX_ASSET_BYTES) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException({ message: 'Upload a PNG, JPG or WebP image under 4 MB', code: 'INVALID_IMAGE' });
    }
    await mkdir(this.assetDir, { recursive: true });
    const name = `${randomUUID()}.${kind.ext}`;
    await rename(file.path, join(this.assetDir, name));
    return { url: `/api/public/assets/${name}`, name };
  }

  async openAsset(name: string) {
    if (!ASSET_NAME.test(name)) throw new NotFoundException();
    const full = resolve(this.assetDir, name);
    if (!full.startsWith(this.assetDir + sep)) throw new NotFoundException();
    try { await stat(full); } catch { throw new NotFoundException(); }
    const mime = IMAGE_TYPES[name.split('.').pop()!]?.mime ?? 'application/octet-stream';
    return { mime, stream: new StreamableFile(createReadStream(full)) };
  }
}
