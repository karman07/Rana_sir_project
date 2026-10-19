import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DEFAULT_TEMPLATES } from './email-templates.defaults';
import { renderEmail } from './email-render';
import { SAMPLE_VALUES, sanitizeBody, variablesIn } from './template-safety';
import { EmailTemplate } from './schemas/email-template.schema';

@Injectable()
export class EmailTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplatesService.name);
  private cache = new Map<string, { at: number; tpl: any }>();

  constructor(@InjectModel(EmailTemplate.name) private readonly model: Model<EmailTemplate>) {}

  /** Inserts missing defaults and refreshes unedited ones; templates an admin has edited are never overwritten. */
  async onModuleInit() {
    for (const t of DEFAULT_TEMPLATES) {
      const fields = { ...t, sensitive: !!t.sensitive };
      // New templates are inserted; ones an admin has not edited follow improved defaults; edited ones are left alone.
      await this.model.updateOne({ key: t.key }, { $setOnInsert: { enabled: true, customised: false } }, { upsert: true }).catch(() => undefined);
      await this.model.updateOne({ key: t.key, customised: false }, { $set: fields });
    }
  }

  async get(key: string) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.tpl;
    const tpl = await this.model.findOne({ key }).lean();
    if (tpl) this.cache.set(key, { at: Date.now(), tpl });
    return tpl;
  }

  list() {
    return this.model.find().sort({ key: 1 }).lean().then((rows) => rows.map(({ _id, __v, ...r }: any) => ({ id: String(_id), ...r })));
  }

  async update(key: string, patch: Partial<Pick<EmailTemplate, 'subject' | 'heading' | 'body' | 'ctaLabel' | 'enabled'>>, adminId: string) {
    const current = await this.model.findOne({ key }).lean();
    if (!current) throw new NotFoundException('Template not found');
    for (const f of ['subject', 'heading', 'body'] as const) {
      if (patch[f] !== undefined && !patch[f]!.trim()) throw new BadRequestException({ message: `The ${f} cannot be empty`, code: 'VALIDATION_FAILED' });
    }
    if (patch.body !== undefined) patch = { ...patch, body: sanitizeBody(patch.body) };
    // Only the variables this email is sent with can be used; anything else would render blank.
    const allowed = new Set(current.variables);
    const unknown = variablesIn(patch.subject, patch.heading, patch.body).filter((v) => !allowed.has(v));
    if (unknown.length) throw new BadRequestException({ message: `These placeholders aren't available in this email: ${unknown.map((v) => `{{${v}}}`).join(', ')}`, code: 'UNKNOWN_VARIABLE', details: unknown });
    const doc = await this.model.findOneAndUpdate({ key }, { $set: { ...patch, customised: true, updatedBy: adminId } }, { returnDocument: 'after' }).lean();
    if (!doc) throw new NotFoundException('Template not found');
    this.cache.delete(key);
    return doc;
  }

  /** Renders a template with believable sample values (or an unsaved draft Admin is still typing) so the editor shows a finished email. */
  async preview(key: string, vars: Record<string, string>, draft?: Partial<Pick<EmailTemplate, 'subject' | 'heading' | 'body' | 'ctaLabel'>>) {
    const tpl = await this.model.findOne({ key }).lean();
    if (!tpl) throw new NotFoundException('Template not found');
    const sample: Record<string, string> = Object.fromEntries(tpl.variables.map((v) => [v, SAMPLE_VALUES[v] ?? `[${v}]`]));
    const merged = { ...tpl, ...Object.fromEntries(Object.entries(draft ?? {}).filter(([, v]) => v !== undefined)) } as typeof tpl;
    if (draft?.body !== undefined) merged.body = sanitizeBody(draft.body);
    return renderEmail(merged, { ...sample, ...vars });
  }

  /** Puts a template back to the wording we ship with. */
  async reset(key: string) {
    const d = DEFAULT_TEMPLATES.find((t) => t.key === key);
    if (!d) throw new NotFoundException('There is no original wording for this template');
    const doc = await this.model.findOneAndUpdate({ key }, { $set: { ...d, sensitive: !!d.sensitive, customised: false }, $unset: { updatedBy: 1 } }, { returnDocument: 'after' }).lean();
    if (!doc) throw new NotFoundException('Template not found');
    this.cache.delete(key);
    return doc;
  }

  /** The values a preview or test send fills in. */
  samples(key: string, variables: string[]) { void key; return Object.fromEntries(variables.map((v) => [v, SAMPLE_VALUES[v] ?? `[${v}]`])); }
}
