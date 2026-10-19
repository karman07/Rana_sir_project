import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { InterviewStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

export const InterviewType = { VIDEO: 'VIDEO', PHONE: 'PHONE', IN_PERSON: 'IN_PERSON' } as const;
export type InterviewType = (typeof InterviewType)[keyof typeof InterviewType];

@Schema({ timestamps: true })
export class Interview extends BaseEntity {
  @Prop({ required: true, unique: true }) interviewNumber: string;
  @Prop({ type: 'ObjectId', ref: 'Application', required: true, index: true }) applicationId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Job', required: true, index: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) candidateId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true }) scheduledBy: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(InterviewType), required: true }) type: InterviewType;
  /** Stored in UTC; `timezone` is the zone the organiser meant, used for display in emails. */
  @Prop({ required: true, index: true }) startsAt: Date;
  @Prop({ required: true, min: 10, max: 480 }) durationMinutes: number;
  @Prop({ default: 'UTC' }) timezone: string;
  /** Which interview this is: ours (ADMIN) comes before the hiring recruiter's (RECRUITER). Earlier records are all recruiter interviews. */
  @Prop({ type: String, enum: ['ADMIN', 'RECRUITER'], default: 'RECRUITER', index: true }) stage: 'ADMIN' | 'RECRUITER';
  @Prop({ default: 1 }) round: number;

  @Prop() meetingLink?: string;
  @Prop() location?: string;
  @Prop() phoneNumber?: string;
  @Prop({ type: [raw({ name: { type: String }, email: { type: String } })], default: [] }) interviewers: { name: string; email?: string }[];
  /** Shown to the candidate (what to bring, how to join). */
  @Prop() instructions?: string;
  /** Internal; never shown to the candidate. */
  @Prop() notes?: string;

  @Prop({ type: String, enum: Object.values(InterviewStatus), default: InterviewStatus.SCHEDULED, index: true }) status: InterviewStatus;
  @Prop({ type: 'ObjectId', ref: 'Interview' }) rescheduledFrom?: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Interview' }) rescheduledTo?: Types.ObjectId;
  @Prop() cancelReason?: string;
  @Prop({ type: [raw({ status: { type: String }, at: { type: Date }, byName: { type: String }, reason: { type: String } })], default: [] })
  history: { status: string; at: Date; byName?: string; reason?: string }[];
  /** The queued 24-hour reminder email, removed if the interview changes. */
  @Prop({ type: 'ObjectId' }) reminderEmailId?: Types.ObjectId;

  createdAt: Date;
}

export type InterviewDocument = HydratedDocument<Interview>;
export const InterviewSchema = SchemaFactory.createForClass(Interview);
InterviewSchema.index({ status: 1, startsAt: 1 });
InterviewSchema.index({ candidateId: 1, startsAt: 1 });
InterviewSchema.index({ recruiterId: 1, startsAt: 1 });
