import { Prop } from '@nestjs/mongoose';
import type { Schema } from 'mongoose';

/** Extend for every persisted entity: timestamps come from `@Schema({ timestamps: true })`. */
export abstract class BaseEntity {
  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

const READ_OPS = ['find', 'findOne', 'findOneAndUpdate', 'countDocuments'] as const;

/**
 * Soft-delete plugin: hides documents with `deletedAt` set unless a query opts in with `{ withDeleted: true }`.
 * Financial/contract/audit entities must never be hard deleted (spec §96).
 */
export function softDeletePlugin(schema: Schema) {
  // Only schemas that opted in (extend BaseEntity) get the filter; counters, tokens and audit logs do not.
  if (!schema.path('deletedAt')) return;
  for (const op of READ_OPS) {
    schema.pre(op as any, function (this: any) {
      if (this.getOptions().withDeleted) return;
      if (this.getFilter().deletedAt === undefined) this.where({ deletedAt: null });
    });
  }
  schema.pre('aggregate', function (this: any) {
    if (this.options?.withDeleted) return;
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });
}
