import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

/**
 * Append-only record of who did what (spec §51, §96). Deliberately not a BaseEntity:
 * there is no soft delete, and update/delete operations are rejected at the schema level.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'auditlogs' })
export class AuditLog {
  @Prop({ type: 'ObjectId', ref: 'User', default: null, index: true }) actorId: Types.ObjectId | null;
  /** Role at the time of the action, or SYSTEM for automated actions. */
  @Prop({ required: true }) actorRole: string;
  /** Snapshot so the log stays readable even if the user is later renamed or removed. */
  @Prop() actorName?: string;

  @Prop({ required: true, index: true }) action: string;
  @Prop({ required: true }) entityType: string;
  @Prop({ required: true }) entityId: string;

  @Prop({ type: Object }) previousState?: unknown;
  @Prop({ type: Object }) newState?: unknown;
  @Prop() reason?: string;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;

  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

const BLOCKED = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
] as const;
for (const op of BLOCKED) {
  AuditLogSchema.pre(op as any, function () {
    throw new Error(`Audit logs are immutable (${op} is not allowed)`);
  });
}
AuditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Audit logs are immutable');
});
