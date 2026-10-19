import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const EmailStatus = {
  QUEUED: 'QUEUED', SENDING: 'SENDING', SENT: 'SENT', DELIVERED: 'DELIVERED', BOUNCED: 'BOUNCED', COMPLAINED: 'COMPLAINED', FAILED: 'FAILED',
} as const;
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

/** One outgoing email. Acts as the outbox (queued -> sent) and the permanent delivery log. */
@Schema({ timestamps: true, collection: 'emails' })
export class Email {
  @Prop({ required: true, lowercase: true, trim: true, index: true }) to: string;
  @Prop() toName?: string;
  @Prop({ type: 'ObjectId', ref: 'User', index: true }) userId?: Types.ObjectId;
  @Prop({ required: true, index: true }) template: string;
  @Prop({ required: true }) subject: string;
  @Prop({ select: false }) html?: string;
  @Prop({ select: false }) text?: string;
  /** True when the body held a one-time link and was scrubbed after sending. */
  @Prop({ default: false }) bodyRedacted: boolean;

  @Prop({ type: String, enum: Object.values(EmailStatus), default: EmailStatus.QUEUED, index: true }) status: EmailStatus;
  @Prop({ default: 0 }) attempts: number;
  /** When it may next be attempted. A future value = a scheduled email. */
  @Prop({ default: () => new Date(), index: true }) nextAttemptAt: Date;
  @Prop() lastAttemptAt?: Date;
  @Prop() sentAt?: Date;
  @Prop() deliveredAt?: Date;
  @Prop() failureReason?: string;
  @Prop() provider?: string;
  @Prop({ index: true }) providerMessageId?: string;
  @Prop(raw({ type: { type: String }, id: { type: String } })) related?: { type?: string; id?: string };
  @Prop({ type: [raw({ status: String, at: Date, detail: String })], default: [] }) events: { status: string; at: Date; detail?: string }[];

  createdAt: Date;
  updatedAt: Date;
}

export type EmailDocument = HydratedDocument<Email>;
export const EmailSchema = SchemaFactory.createForClass(Email);
EmailSchema.index({ status: 1, nextAttemptAt: 1 });
EmailSchema.index({ createdAt: -1 });
