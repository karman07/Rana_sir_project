import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/** Overall stage of one period's payment, combining the two legs. */
export const PaymentStage = {
  AWAITING_CLIENT: 'AWAITING_CLIENT', // the company/recruiter has yet to pay us
  CLIENT_PAID: 'CLIENT_PAID', // they say they paid; Admin has yet to confirm receipt
  RECEIVED: 'RECEIVED', // we have the money; the candidate's payout is due
  PAYOUT_SENT: 'PAYOUT_SENT', // Admin sent the candidate's pay; the candidate has yet to confirm
  COMPLETED: 'COMPLETED', // the candidate confirmed receipt
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStage = (typeof PaymentStage)[keyof typeof PaymentStage];

export type ClientLegStatus = 'AWAITING' | 'MARKED_PAID' | 'RECEIVED' | 'DISPUTED';
export type PayoutLegStatus = 'NOT_DUE' | 'PENDING' | 'SENT' | 'CONFIRMED' | 'DISPUTED';

/** Payments move by hand: someone records that they paid, the other side confirms. There is no payment gateway. */
@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends BaseEntity {
  @Prop({ required: true, unique: true }) paymentNumber: string;
  @Prop({ required: true, unique: true }) transactionId: string;

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
  /** Plain calendar day the company is expected to pay by. */
  @Prop({ required: true }) dueDate: string;
  @Prop({ required: true, uppercase: true }) currency: string;
  /** Hourly contracts: the hours this period's amount is based on. */
  @Prop() hoursWorked?: number;

  /** Minor units, calculated by the server when generated or adjusted; later contract changes never rewrite them. */
  @Prop({ required: true }) grossAmount: number;
  @Prop({ required: true }) commissionAmount: number;
  @Prop({ required: true }) candidateAmount: number;
  /** What was originally due, kept when the recruiter released a different amount and the figures were recalculated. */
  @Prop() dueGross?: number;
  @Prop({ type: Object }) rule?: unknown;

  @Prop({ type: String, enum: Object.values(PaymentStage), default: PaymentStage.AWAITING_CLIENT, index: true }) status: PaymentStage;

  @Prop(raw({
    status: { type: String, enum: ['AWAITING', 'MARKED_PAID', 'RECEIVED', 'DISPUTED'], default: 'AWAITING' },
    amountSent: Number, sentAt: Date, method: String, reference: String, note: String, proofDocumentId: { type: 'ObjectId' },
    markedBy: { type: 'ObjectId' }, batchRef: String, amountReceived: Number, confirmedAt: Date, confirmedBy: { type: 'ObjectId' }, disputeNote: String,
  }))
  client: {
    status: ClientLegStatus; amountSent?: number; sentAt?: Date; method?: string; reference?: string; note?: string; proofDocumentId?: Types.ObjectId;
    markedBy?: Types.ObjectId; batchRef?: string; amountReceived?: number; confirmedAt?: Date; confirmedBy?: Types.ObjectId; disputeNote?: string;
  };

  @Prop(raw({
    status: { type: String, enum: ['NOT_DUE', 'PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'], default: 'NOT_DUE' },
    amountSent: Number, sentAt: Date, method: String, reference: String, note: String, proofDocumentId: { type: 'ObjectId' },
    sentBy: { type: 'ObjectId' }, confirmedAt: Date, disputeNote: String,
  }))
  payout: {
    status: PayoutLegStatus; amountSent?: number; sentAt?: Date; method?: string; reference?: string; note?: string; proofDocumentId?: Types.ObjectId;
    sentBy?: Types.ObjectId; confirmedAt?: Date; disputeNote?: string;
  };

  /** The candidate asked for this pay from their own portal; recruiter and Admin are told. */
  @Prop(raw({ at: Date, by: { type: 'ObjectId' }, note: String }))
  candidateRequest?: { at: Date; by: Types.ObjectId; note?: string };

  @Prop({ type: [{ _id: false, status: String, at: Date, byId: String, byName: String, byRole: String, note: String }], default: [] })
  history: { status: string; at: Date; byId?: string; byName?: string; byRole?: string; note?: string }[];

  @Prop() cancelledReason?: string;
  @Prop({ type: Date }) overdueNotifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
// One payment per contract per period, so generating twice is harmless.
PaymentSchema.index({ contractId: 1, period: 1 }, { unique: true });
PaymentSchema.index({ status: 1, dueDate: 1 });
