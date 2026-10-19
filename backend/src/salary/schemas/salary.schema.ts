import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

export type DelayStatus = 'NONE' | 'REPORTED' | 'PUBLISHED' | 'REJECTED' | 'RESOLVED';

/**
 * One period's pay for a candidate on a contract. It exists before anything is paid, so the candidate can see what's coming,
 * and follows the matching Payment through to PAID. Status is kept in step by the salary service.
 */
@Schema({ timestamps: true, collection: 'salaries' })
export class Salary extends BaseEntity {
  @Prop({ required: true, unique: true }) salaryNumber: string;
  @Prop({ type: 'ObjectId', ref: 'Contract', required: true, index: true }) contractId: Types.ObjectId;
  @Prop({ required: true }) contractNumber: string;
  @Prop({ required: true }) contractVersion: number;
  @Prop({ type: 'ObjectId', ref: 'Application', required: true }) applicationId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Job', required: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) candidateId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true }) companyId: Types.ObjectId;

  /** "2026-11". */
  @Prop({ required: true, index: true }) period: string;
  @Prop({ required: true, uppercase: true }) currency: string;
  /** Plain calendar day pay is expected by; moves when a delay is published. */
  @Prop({ required: true }) payDate: string;
  /** The date it was first expected, kept so a delay is visible as a change. */
  @Prop({ required: true }) originalPayDate: string;

  /** Minor units. `amount` is what the candidate receives; `grossAmount` is the company-side figure (never shown to candidates). */
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) grossAmount: number;
  /** Hourly contracts: hours submitted for the period. */
  @Prop() hoursWorked?: number;
  /** Whether the contract is paid by the hour, so hours can be submitted. */
  @Prop({ default: false }) hourly: boolean;
  @Prop(raw({ id: String, name: String, role: String, at: Date })) hoursSubmittedBy?: { id?: string; name?: string; role?: string; at?: Date };

  @Prop({ type: 'ObjectId', ref: 'Payment' }) paymentId?: Types.ObjectId;
  @Prop({ type: String, enum: ['UPCOMING', 'PENDING', 'PROCESSING', 'PAID', 'DELAYED', 'DISPUTED'], default: 'UPCOMING', index: true }) status: string;
  /** Candidate has confirmed the money reached them. */
  @Prop({ default: false }) confirmed: boolean;

  @Prop(raw({
    status: { type: String, enum: ['NONE', 'REPORTED', 'PUBLISHED', 'REJECTED', 'RESOLVED'], default: 'NONE' },
    reason: String, newPayDate: String,
    reportedBy: raw({ id: String, name: String, role: String }), reportedAt: Date,
    decidedByName: String, decidedAt: Date, decisionNote: String, publishedAt: Date,
  }))
  delay: {
    status: DelayStatus; reason?: string; newPayDate?: string; reportedBy?: { id?: string; name?: string; role?: string }; reportedAt?: Date;
    decidedByName?: string; decidedAt?: Date; decisionNote?: string; publishedAt?: Date;
  };
  /** Every delay report, newest last, so what was said and decided is never lost. */
  @Prop({ type: [{ _id: false, status: String, reason: String, newPayDate: String, byName: String, byRole: String, at: Date, note: String }], default: [] })
  delayLog: { status: string; reason?: string; newPayDate?: string; byName?: string; byRole?: string; at: Date; note?: string }[];

  @Prop({ type: [{ _id: false, status: String, at: Date, note: String }], default: [] }) history: { status: string; at: Date; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
}
export type SalaryDocument = HydratedDocument<Salary>;
export const SalarySchema = SchemaFactory.createForClass(Salary);
SalarySchema.index({ contractId: 1, period: 1 }, { unique: true });
SalarySchema.index({ 'delay.status': 1 });
