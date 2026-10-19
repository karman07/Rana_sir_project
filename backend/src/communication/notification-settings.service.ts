import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { CATALOG_EVENTS, NOTIFICATION_CATALOG } from './notification-catalog';
import { NotificationSetting } from './schemas/notification-setting.schema';

export interface Channels { inApp: boolean; email: boolean }

@Injectable()
export class NotificationSettingsService {
  private cache?: { at: number; map: Map<string, Channels> };
  constructor(@InjectModel(NotificationSetting.name) private readonly model: Model<NotificationSetting>) {}

  private async map() {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.map;
    const rows = await this.model.find().lean();
    const map = new Map(rows.map((r) => [r.event, { inApp: r.inApp, email: r.email }]));
    this.cache = { at: Date.now(), map };
    return map;
  }

  /** What the listener consults for each delivery. Locked events always go out everywhere. */
  async channels(event: string): Promise<Channels> {
    if (NOTIFICATION_CATALOG.find((c) => c.event === event)?.locked) return { inApp: true, email: true };
    return (await this.map()).get(event) ?? { inApp: true, email: true };
  }

  async list() {
    const map = await this.map();
    return NOTIFICATION_CATALOG.map((c) => ({ ...c, ...(c.locked ? { inApp: true, email: true } : map.get(c.event) ?? { inApp: true, email: true }) }));
  }

  async update(event: string, patch: Partial<Channels>, adminId: string) {
    if (!CATALOG_EVENTS.has(event)) throw new NotFoundException('Unknown notification');
    if (NOTIFICATION_CATALOG.find((c) => c.event === event)?.locked) throw new BadRequestException({ message: 'This notification is required and cannot be turned off', code: 'LOCKED' });
    await this.model.updateOne({ event }, { $set: { ...patch, updatedBy: adminId }, $setOnInsert: { event } }, { upsert: true });
    this.cache = undefined;
    return (await this.list()).find((c) => c.event === event);
  }
}
