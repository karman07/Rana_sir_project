import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent } from '@rms/shared';
import type { Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import { PlatformSetting } from './schemas/setting.schema';
import type { UpdateSettingsDto } from './dto/settings.dto';

export interface PlatformSettings {
  company: { name: string; legalName: string; supportEmail: string; supportPhone: string; address: string; website: string };
  defaults: { currency: string };
  payments: { dueGraceDays: number; salaryPayLagDays: number };
  documents: { maxUploadMb: number };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  company: { name: 'Talentbridge', legalName: '', supportEmail: '', supportPhone: '', address: '', website: '' },
  defaults: { currency: 'USD' },
  payments: { dueGraceDays: 5, salaryPayLagDays: 7 },
  documents: { maxUploadMb: 5 },
};

const KEY = 'platform';
/** Only the values actually given replace the existing ones; a missing field never blanks what was there. */
const given = (o: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
const merge = (base: PlatformSettings, over: Record<string, any> | undefined): PlatformSettings => ({
  company: { ...base.company, ...given(over?.company) }, defaults: { ...base.defaults, ...given(over?.defaults) },
  payments: { ...base.payments, ...given(over?.payments) }, documents: { ...base.documents, ...given(over?.documents) },
});

/** Platform-wide settings Admin can change, read by the services they affect. Always returns a complete set. */
@Injectable()
export class SettingsService {
  private cache?: { at: number; value: PlatformSettings };
  constructor(@InjectModel(PlatformSetting.name) private readonly model: Model<PlatformSetting>, private readonly events: EventBusService) {}

  async get(): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.value;
    const doc = await this.model.findOne({ key: KEY }).lean();
    const value = merge(DEFAULT_SETTINGS, doc?.data as Record<string, any> | undefined);
    this.cache = { at: Date.now(), value };
    return value;
  }

  async update(patch: UpdateSettingsDto, admin: AuthUser) {
    const before = await this.get();
    const next = merge(before, patch as Record<string, any>);
    if (JSON.stringify(next) === JSON.stringify(before)) return before;
    await this.model.updateOne({ key: KEY }, { $set: { data: next, updatedBy: admin.id }, $setOnInsert: { key: KEY } }, { upsert: true });
    this.cache = undefined;
    await this.events.publish(DomainEvent.SETTINGS_UPDATED, { actor: { id: admin.id, role: admin.role }, entity: { type: 'PlatformSettings', id: KEY }, previousState: before, newState: next });
    return next;
  }

  /** What any signed-in person's forms may use: no contact details beyond the public ones. */
  async defaults() {
    const s = await this.get();
    return { companyName: s.company.name, currency: s.defaults.currency, maxUploadMb: s.documents.maxUploadMb, supportEmail: s.company.supportEmail || undefined };
  }
}
