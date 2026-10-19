import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

/** Everything a payslip says, frozen at the moment it was issued. Plain strings and numbers only, so the checksum is stable. */
export interface PayslipData {
  payslipNumber: string; issuedOn: string;
  period: string; periodStart: string; periodEnd: string;
  candidate: { name: string; email: string };
  company: string; jobTitle: string; contractNumber: string; contractVersion: number; employmentType: string;
  currency: string; payBasis: 'HOUR' | 'MONTH' | 'YEAR'; rate: number; hoursWorked?: number;
  lines: { label: string; detail?: string; amount: number }[];
  netPay: number;
  payment: { method?: string; reference?: string; paidOn?: string };
}

/**
 * An immutable record of what a candidate was paid for one period. It is written once and never changed:
 * later contract revisions, rate changes or corrections affect future payslips only. It carries the candidate's own figures,
 * never the company's amount or the platform's commission.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'payslips' })
export class Payslip {
  @Prop({ required: true, unique: true }) payslipNumber: string;
  /** One payslip per payment. */
  @Prop({ type: 'ObjectId', ref: 'Payment', required: true, unique: true }) paymentId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Salary' }) salaryId?: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Contract', required: true, index: true }) contractId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) candidateId: Types.ObjectId;
  @Prop({ required: true, index: true }) period: string;
  @Prop({ required: true, uppercase: true }) currency: string;
  @Prop({ required: true }) netPay: number;
  /** The frozen content. */
  @Prop({ type: Object, required: true }) data: PayslipData;
  /** SHA-256 of `data`, so any later tampering shows. */
  @Prop({ required: true }) checksum: string;
  @Prop({ type: 'ObjectId', ref: 'DocumentFile' }) pdfDocumentId?: Types.ObjectId;
  createdAt: Date;
}
export type PayslipDocument = HydratedDocument<Payslip>;
export const PayslipSchema = SchemaFactory.createForClass(Payslip);

/** Payslips are append-only: no update or delete path exists, and the database layer refuses one too. */
const REFUSED = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const;
for (const op of REFUSED) {
  PayslipSchema.pre(op, function () { throw new Error('Payslips are immutable and cannot be changed or deleted'); });
}
PayslipSchema.pre('save', function () { if (!this.isNew) throw new Error('Payslips are immutable and cannot be changed'); });
PayslipSchema.index({ candidateId: 1, period: -1 });
