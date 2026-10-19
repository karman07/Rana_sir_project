import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { JobSpec, JobSpecSchema } from './job-spec.schema';

export const JobChangeType = { EDIT: 'EDIT', CLOSE: 'CLOSE' } as const;
export type JobChangeType = (typeof JobChangeType)[keyof typeof JobChangeType];
export type JobChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * Once a job is live, a recruiter can't edit or close it themselves: they ask, and Admin decides.
 * An EDIT carries the whole proposed opening; a CLOSE carries the reason the opening should end.
 */
@Schema({ timestamps: true, collection: 'jobchangerequests' })
export class JobChangeRequest {
  @Prop({ required: true, unique: true }) changeNumber: string;
  @Prop({ type: 'ObjectId', ref: 'Job', required: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'JobRequest', required: true }) jobRequestId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true }) companyId: Types.ObjectId;
  @Prop({ type: String, enum: Object.values(JobChangeType), required: true }) type: JobChangeType;
  @Prop({ required: true, trim: true }) reason: string;
  /** The proposed opening (EDIT only). */
  @Prop({ type: JobSpecSchema }) spec?: JobSpec;
  /** What each changed field was and would become, worked out when the request was made. */
  @Prop({ type: [raw({ field: String, label: String, from: Object, to: Object })], default: [] }) changes: { field: string; label: string; from: unknown; to: unknown }[];
  @Prop({ type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', index: true }) status: JobChangeStatus;
  @Prop({ default: () => new Date() }) submittedAt: Date;
  @Prop({ type: 'ObjectId', ref: 'User' }) decidedBy?: Types.ObjectId;
  @Prop() decidedByName?: string;
  @Prop() decidedAt?: Date;
  @Prop() decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}
export type JobChangeRequestDocument = HydratedDocument<JobChangeRequest>;
export const JobChangeRequestSchema = SchemaFactory.createForClass(JobChangeRequest);
// A job has at most one request waiting for Admin.
JobChangeRequestSchema.index({ jobId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
