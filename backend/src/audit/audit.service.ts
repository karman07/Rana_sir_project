import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { paginate } from '../common/database/paginate';
import type { AuditQueryDto } from './dto/audit-query.dto';
import { AuditLog } from './schemas/audit-log.schema';

export interface AuditEntry {
  actor: { id: string | null; role: string; name?: string };
  action: string;
  entity: { type: string; id: string };
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  at?: Date;
}

const SECRET_KEYS = /pass(word)?|token|secret|hash|authorization|credential/i;

/** Removes anything credential-like before it is persisted in an append-only log. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  );
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  async record(e: AuditEntry) {
    await this.model.create({
      actorId: e.actor.id, actorRole: e.actor.role, actorName: e.actor.name,
      action: e.action, entityType: e.entity.type, entityId: e.entity.id,
      previousState: redact(e.previousState), newState: redact(e.newState), reason: e.reason,
      metadata: redact(e.metadata) as Record<string, unknown> | undefined,
      ...(e.at ? { createdAt: e.at } : {}),
    });
  }

  async list(q: AuditQueryDto) {
    const filter: Record<string, unknown> = {};
    if (q.entityType) filter.entityType = q.entityType;
    if (q.entityId) filter.entityId = q.entityId;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.action) filter.action = q.action;
    if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
    const { items, meta } = await paginate(this.model, filter, q, {
      sortable: ['createdAt', 'action', 'entityType', 'actorName'],
      defaultSort: '-createdAt',
      searchFields: ['action', 'entityType', 'entityId', 'actorName', 'reason'],
    });
    return { items: items.map(({ _id, __v, ...rest }: any) => ({ id: String(_id), ...rest })), meta };
  }

  /** Distinct action names, for filter dropdowns. */
  actions() {
    return this.model.distinct('action').exec();
  }
}
