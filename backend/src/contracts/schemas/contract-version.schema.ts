import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import type { CommissionRule, ContractFinancials } from '../commission-calculation.service';

export interface ContractTerms {
  title: string;
  employmentType: string;
  salary: { amount: number; currency: string; period: 'HOUR' | 'MONTH' | 'YEAR'; hoursPerWeek?: number };
  commission: CommissionRule;
  startDate: string;
  endDate?: string;
  probationMonths?: number;
  workingHours?: string;
  noticePeriodDays?: number;
  renewalTerms?: string;
  notes?: string;
}

export type VersionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED';

/**
 * One snapshot of a contract's terms plus the money calculated from them. Versions are append-only:
 * after the contract is approved, a change always creates version n+1 and keeps n exactly as it was.
 */
@Schema({ timestamps: true, collection: 'contractversions' })
export class ContractVersion {
  @Prop({ type: 'ObjectId', ref: 'Contract', required: true, index: true }) contractId: Types.ObjectId;
  @Prop({ required: true }) version: number;
  @Prop({ type: Object, required: true }) terms: ContractTerms;
  /** Calculated by CommissionCalculationService when the version was created; the history of what was agreed. */
  @Prop({ type: Object, required: true }) financials: ContractFinancials;

  @Prop({ type: String, enum: ['INITIAL', 'CHANGE'], default: 'INITIAL' }) kind: 'INITIAL' | 'CHANGE';
  @Prop({ type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED'], default: 'PENDING', index: true }) status: VersionStatus;

  @Prop(raw({ id: { type: String }, name: { type: String }, role: { type: String } })) changedBy: { id: string; name: string; role: string };
  @Prop() reason?: string;
  /** Field-by-field previous and new values against the version it was based on. */
  @Prop({ type: [raw({ _id: false, field: { type: String }, label: { type: String }, from: { type: Object }, to: { type: Object } })], default: [] })
  changes: { field: string; label: string; from: unknown; to: unknown }[];

  @Prop() decidedBy?: string;
  @Prop() decidedByName?: string;
  @Prop() decidedAt?: Date;
  @Prop() decisionNote?: string;
  createdAt: Date;
}

export type ContractVersionDocument = HydratedDocument<ContractVersion>;
export const ContractVersionSchema = SchemaFactory.createForClass(ContractVersion);
ContractVersionSchema.index({ contractId: 1, version: 1 }, { unique: true });
