import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const LedgerType = { CLIENT_RECEIPT: 'CLIENT_RECEIPT', COMMISSION: 'COMMISSION', CANDIDATE_PAYOUT: 'CANDIDATE_PAYOUT', REVERSAL: 'REVERSAL' } as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

/**
 * An append-only line in the money record. Entries are never edited or deleted; a correction is a new REVERSAL entry.
 * Sign convention: money in and platform earnings are positive, money out is negative.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'ledger' })
export class LedgerEntry {
  @Prop({ type: 'ObjectId', ref: 'Payment', required: true, index: true }) paymentId: Types.ObjectId;
  @Prop({ required: true }) paymentNumber: string;
  @Prop({ required: true }) transactionId: string;
  @Prop({ type: 'ObjectId', ref: 'Contract', required: true }) contractId: Types.ObjectId;
  @Prop({ required: true }) contractNumber: string;
  @Prop({ type: String, enum: Object.values(LedgerType), required: true, index: true }) type: LedgerType;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true, uppercase: true }) currency: string;
  @Prop({ required: true }) period: string;
  @Prop() reference?: string;
  @Prop() memo?: string;
  @Prop({ type: 'ObjectId' }) recordedBy?: Types.ObjectId;
  createdAt: Date;
}
export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;
export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ createdAt: -1 });
