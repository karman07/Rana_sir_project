import { ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus, DomainEvent, Role } from '@rms/shared';
import { randomUUID } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Model } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { ALLOWED, RESUME_EXTENSIONS, sanitizeFileName, verifyStoredFile } from './file-validation';
import { paginate } from '../common/database/paginate';
import { Payment } from '../payments/schemas/payment.schema';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/schemas/user.schema';
import type { ListDocumentsQueryDto } from './dto/document.dto';
import { DocumentFile, DocumentType } from './schemas/document.schema';

/** Recruiters may only see candidate files once Admin has sent that candidate to them. */
export const RECRUITER_VISIBLE: string[] = [
  ApplicationStatus.SENT_TO_RECRUITER, ApplicationStatus.RECRUITER_REVIEW, ApplicationStatus.RECRUITER_APPROVED, ApplicationStatus.INTERVIEW,
  ApplicationStatus.SELECTED, ApplicationStatus.CONTRACT, ApplicationStatus.PLACED,
];

export interface StoredUpload { path: string; filename: string; originalname: string; size: number }

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentFile.name) private readonly docs: Model<DocumentFile>,
    @InjectModel(Application.name) private readonly applications: Model<Application>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
  ) {}

  get root() {
    return resolve(this.config.get('UPLOAD_DIR'));
  }


  async register(file: StoredUpload, owner: AuthUser, meta: { type: DocumentType; label?: string; related?: { type: string; id: string }; group?: string }) {
    // The size limit is a setting Admin can change, so it is checked here once the file is on disk; an oversized file is removed straight away.
    const maxMb = (await this.settings.get()).documents.maxUploadMb;
    if (file.size > maxMb * 1024 * 1024) {
      await unlink(file.path).catch(() => undefined);
      throw new PayloadTooLargeException({ message: `Files can be up to ${maxMb} MB`, code: 'FILE_TOO_LARGE' });
    }
    const allowed = meta.type === DocumentType.RESUME ? RESUME_EXTENSIONS : Object.keys(ALLOWED);
    const mime = await verifyStoredFile(file.path, file.originalname, allowed);
    const storageKey = file.path.slice(this.root.length + 1);
    const groupKey = meta.group;

    let version = 1;
    if (groupKey) {
      const latest = await this.docs.findOne({ ownerId: owner.id, groupKey }).sort({ version: -1 }).lean();
      version = (latest?.version ?? 0) + 1;
      await this.docs.updateMany({ ownerId: owner.id, groupKey, status: 'ACTIVE' }, { status: 'ARCHIVED' });
    }
    const doc = await this.docs.create({
      ownerId: owner.id, type: meta.type, label: meta.label?.slice(0, 120), groupKey, version, related: meta.related,
      originalName: sanitizeFileName(file.originalname), mime, size: file.size, storageKey,
    });
    await this.events.publish(DomainEvent.DOCUMENT_UPLOADED, {
      actor: { id: owner.id, role: owner.role }, entity: { type: 'Document', id: doc.id },
      data: { documentType: doc.type, label: doc.label, fileName: doc.originalName, version },
    });
    return this.present(doc);
  }

  /** Stores a file the system produced itself (a payslip PDF) under a random key, owned by the person it belongs to. */
  async registerGenerated(bytes: Buffer, owner: { id: string; role: Role }, meta: { type: DocumentType; fileName: string; mime: string; label?: string; related?: { type: string; id: string }; group?: string }) {
    const d = new Date();
    const dir = join(this.root, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'));
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.pdf`;
    await writeFile(join(dir, name), bytes, { mode: 0o600 });
    // Regenerated documents (a contract after a change) keep every earlier version, marked archived, never deleted.
    let version = 1;
    if (meta.group) {
      version = ((await this.docs.findOne({ ownerId: owner.id, groupKey: meta.group }).sort({ version: -1 }).lean())?.version ?? 0) + 1;
      await this.docs.updateMany({ ownerId: owner.id, groupKey: meta.group, status: 'ACTIVE' }, { status: 'ARCHIVED' });
    }
    const doc = await this.docs.create({
      ownerId: owner.id, type: meta.type, label: meta.label, groupKey: meta.group, version, related: meta.related,
      originalName: sanitizeFileName(meta.fileName), mime: meta.mime, size: bytes.length, storageKey: join(String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), name),
    });
    return this.present(doc);
  }

  present(d: any) {
    return { id: String(d._id ?? d.id), type: d.type, label: d.label, version: d.version, status: d.status, originalName: d.originalName, mime: d.mime, size: d.size, createdAt: d.createdAt, related: d.related ? { type: d.related.type, id: d.related.id } : undefined };
  }

  /** Every file in the system, for Admin, with whose it is and what it belongs to. */
  async listAll(q: ListDocumentsQueryDto) {
    const filter: Record<string, unknown> = {};
    if (q.type) filter.type = q.type;
    if (q.status) filter.status = q.status;
    if (q.ownerId) filter.ownerId = q.ownerId;
    const { items, meta } = await paginate(this.docs, filter as never, q, {
      sortable: ['createdAt', 'type', 'size', 'originalName', 'version'], defaultSort: '-createdAt', searchFields: ['label', 'originalName'], populate: [{ path: 'ownerId', select: 'name email role' }] as never,
    });
    return { items: items.map((d: any) => ({ ...this.present(d), owner: d.ownerId && typeof d.ownerId === 'object' ? { id: String(d.ownerId._id), name: d.ownerId.name, email: d.ownerId.email, role: d.ownerId.role } : undefined })), meta };
  }

  async canRead(user: AuthUser, doc: { ownerId: unknown; type?: string; related?: { type: string; id: string } | null }) {
    try { await this.assertCanRead(user, doc); return true; } catch { return false; }
  }

  /** Files attached to one record (a contract's offer letter and copies), limited to what this person may open. */
  async forEntity(relatedType: string, relatedId: string, user: AuthUser) {
    const rows = await this.docs.find({ 'related.type': relatedType, 'related.id': relatedId }).sort({ createdAt: -1 }).lean();
    const visible: typeof rows = [];
    for (const r of rows) if (await this.canRead(user, r as never)) visible.push(r);
    return visible.map((d) => this.present(d));
  }

  /* ---------------- signed, expiring download links ---------------- */

  private sign(payload: string) {
    return createHmac('sha256', `documents:${this.config.get('JWT_ACCESS_SECRET')}`).update(payload).digest('base64url');
  }

  /**
   * A link that opens one file for a few minutes without any cookie, e.g. in a new tab or on another device.
   * It names the person it was issued to, and access is checked again when it is used, so a leaked link never outlives
   * the person's right to the file.
   */
  async signLink(id: string, user: AuthUser, inline: boolean) {
    await this.findForRead(id, user);
    const ttlSeconds = 300;
    const payload = Buffer.from(JSON.stringify({ d: id, u: user.id, i: inline ? 1 : 0, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
    return { path: `/documents/signed?t=${payload}.${this.sign(payload)}`, expiresInSeconds: ttlSeconds };
  }

  async streamSigned(token: string) {
    const [payload, sig] = (token ?? '').split('.');
    const good = payload && sig && (() => { const a = Buffer.from(this.sign(payload)), b = Buffer.from(sig); return a.length === b.length && timingSafeEqual(a, b); })();
    if (!good) throw new ForbiddenException('This link is not valid');
    let p: { d: string; u: string; i: number; e: number };
    try { p = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new ForbiddenException('This link is not valid'); }
    if (!p.e || p.e < Math.floor(Date.now() / 1000)) throw new ForbiddenException({ message: 'This link has expired. Open the document again to get a new one', code: 'LINK_EXPIRED' });
    const u = await this.users.findById(p.u).select('name email role status').lean();
    if (!u || u.status !== 'ACTIVE') throw new ForbiddenException('This link is not valid');
    const user: AuthUser = { id: String(u._id), role: u.role as Role, name: u.name, email: u.email };
    return { ...(await this.stream(p.d, user)), inline: p.i === 1 };
  }

  async listMine(user: AuthUser) {
    const rows = await this.docs.find({ ownerId: user.id }).sort({ createdAt: -1 }).lean();
    return rows.map((d) => this.present(d));
  }

  /** The single place document access is decided. */
  async assertCanRead(user: AuthUser, doc: { ownerId: unknown; type?: string; related?: { type: string; id: string } | null }) {
    if (user.role === Role.ADMIN || String(doc.ownerId) === user.id) return;
    // A payslip, contract copy or offer letter is the candidate's own record, with their own pay figures. A recruiter must never read the candidate's copy, or the difference from their own figures would reveal how the platform earns. Recruiters get a company copy of their own.
    if (doc.type === DocumentType.PAYSLIP || doc.type === DocumentType.CONTRACT || doc.type === DocumentType.OFFER_LETTER) throw new NotFoundException('Document not found');
    // Proof of payment: the company's side is visible to its recruiter, our payout side to the candidate paid. Never across.
    if (doc.related?.type === 'PaymentClientProof' || doc.related?.type === 'PaymentPayoutProof') {
      const mine = doc.related.type === 'PaymentPayoutProof' ? { candidateId: user.id } : { recruiterId: user.id };
      if ((doc.related.type === 'PaymentPayoutProof' ? user.role === Role.CANDIDATE : user.role === Role.RECRUITER)
        && (await this.payments.exists({ _id: doc.related.id, ...mine } as never))) return;
      throw new NotFoundException('Document not found');
    }
    if (user.role === Role.RECRUITER) {
      const sent = await this.applications.exists({ candidateId: doc.ownerId as never, recruiterId: user.id as never, status: { $in: RECRUITER_VISIBLE } as never });
      if (sent) return;
    }
    // 404, not 403: do not confirm that a file exists.
    throw new NotFoundException('Document not found');
  }

  async findForRead(id: string, user: AuthUser) {
    const doc = await this.docs.findById(id).select('+storageKey');
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertCanRead(user, doc);
    return doc;
  }

  async stream(id: string, user: AuthUser) {
    const doc = await this.findForRead(id, user);
    const full = resolve(this.root, doc.storageKey);
    if (!full.startsWith(this.root + sep)) throw new ForbiddenException(); // defence in depth against a tampered key
    try {
      await stat(full);
    } catch {
      throw new NotFoundException('File is no longer available');
    }
    return { doc, stream: new StreamableFile(createReadStream(full)) };
  }

  /** Marks a candidate's active resume as owned/valid for use in an application. */
  async activeResume(ownerId: string) {
    return this.docs.findOne({ ownerId, type: DocumentType.RESUME, status: 'ACTIVE' }).sort({ version: -1 }).lean();
  }

  async ownedByIds(ownerId: string, ids: string[]) {
    return this.docs.find({ _id: { $in: ids }, ownerId }).lean();
  }
}
