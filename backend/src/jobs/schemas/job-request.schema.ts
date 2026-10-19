import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { JobRequestStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';
import { JobSpec, JobSpecSchema } from './job-spec.schema';

@Schema({ _id: false })
export class JobReview {
  @Prop({ required: true }) action: 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'CHANGE_APPROVED' | 'ADMIN_EDITED';
  @Prop({ type: 'ObjectId', ref: 'User' }) byId?: Types.ObjectId;
  @Prop() byName?: string;
  @Prop() byRole?: string;
  @Prop() note?: string;
  @Prop({ required: true }) version: number;
  @Prop({ default: () => new Date() }) at: Date;
}
const JobReviewSchema = SchemaFactory.createForClass(JobReview);

@Schema({ _id: false })
export class JobRevision {
  @Prop({ required: true }) version: number;
  @Prop({ default: () => new Date() }) submittedAt: Date;
  @Prop({ type: JobSpecSchema }) spec: JobSpec;
}
const JobRevisionSchema = SchemaFactory.createForClass(JobRevision);

/**
 * A recruiter's hiring requirement and its review history. Editable while DRAFT / CHANGES_REQUESTED.
 * Each submission appends a revision snapshot so Admin can see exactly what changed between rounds.
 */
@Schema({ timestamps: true })
export class JobRequest extends BaseEntity {
  @Prop({ required: true, unique: true }) requestNumber: string;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true, index: true }) companyId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(JobRequestStatus), default: JobRequestStatus.DRAFT, index: true })
  status: JobRequestStatus;

  /** 0 while never submitted; +1 on every (re)submission. */
  @Prop({ default: 0 }) version: number;
  @Prop({ type: JobSpecSchema, default: () => ({}) }) spec: JobSpec;

  @Prop() submittedAt?: Date;
  @Prop({ type: [JobReviewSchema], default: [] }) reviews: JobReview[];
  @Prop({ type: [JobRevisionSchema], default: [] }) revisions: JobRevision[];
  /** The public Job created on approval. */
  @Prop({ type: 'ObjectId', ref: 'Job' }) jobId?: Types.ObjectId;
}

export type JobRequestDocument = HydratedDocument<JobRequest>;
export const JobRequestSchema = SchemaFactory.createForClass(JobRequest);
JobRequestSchema.index({ status: 1, submittedAt: 1 });
JobRequestSchema.index({ recruiterId: 1, status: 1, updatedAt: -1 });
