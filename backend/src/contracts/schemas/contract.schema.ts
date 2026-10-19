import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { ContractStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/**
 * A placement contract. The commercial terms live in ContractVersion rows (never overwritten);
 * this document holds the workflow state and a pointer to the version currently in force.
 */
@Schema({ timestamps: true })
export class Contract extends BaseEntity {
  @Prop({ required: true, unique: true }) contractNumber: string;
  /** One contract per application. */
  @Prop({ type: 'ObjectId', ref: 'Application', required: true, unique: true }) applicationId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Job', required: true, index: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) candidateId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true, index: true }) companyId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ContractStatus), default: ContractStatus.DRAFT, index: true }) status: ContractStatus;
  @Prop({ default: 1 }) currentVersion: number;
  @Prop(raw({ id: { type: String }, role: { type: String }, name: { type: String } })) createdBy: { id: string; role: string; name: string };

  /** Denormalised from the current version so expiry and lists can query them. YYYY-MM-DD. */
  @Prop({ index: true }) startDate?: string;
  @Prop({ index: true }) endDate?: string;

  @Prop({ type: [raw({ _id: false, status: { type: String }, at: { type: Date }, byName: { type: String }, role: { type: String }, note: { type: String } })], default: [] })
  statusHistory: { status: string; at: Date; byName?: string; role?: string; note?: string }[];
  @Prop(raw({ by: { type: String }, role: { type: String }, reason: { type: String }, at: { type: Date } }))
  lastDecline?: { by: string; role: string; reason: string; at: Date };

  @Prop() activatedAt?: Date;
  @Prop() expiringNotifiedAt?: Date;
  @Prop() terminatedAt?: Date;
  @Prop() terminationReason?: string;
  createdAt: Date;
}

export type ContractDocument = HydratedDocument<Contract>;
export const ContractSchema = SchemaFactory.createForClass(Contract);
ContractSchema.index({ status: 1, endDate: 1 });
