import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { JobStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';
import { JobSpec, JobSpecSchema } from './job-spec.schema';

/** Live opening, created when Admin approves a JobRequest. `spec` is a snapshot: later request edits never alter it. */
@Schema({ timestamps: true })
export class Job extends BaseEntity {
  @Prop({ required: true, unique: true }) jobNumber: string;
  @Prop({ type: 'ObjectId', ref: 'JobRequest', required: true, unique: true }) jobRequestId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true, index: true }) companyId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(JobStatus), default: JobStatus.APPROVED, index: true })
  status: JobStatus;

  @Prop({ type: JobSpecSchema, required: true }) spec: JobSpec;
  @Prop({ type: 'ObjectId', ref: 'User' }) approvedBy?: Types.ObjectId;
  @Prop() approvedAt?: Date;
  @Prop() publishedAt?: Date;
  @Prop() closedAt?: Date;
  @Prop() closeReason?: string;
}

export type JobDocument = HydratedDocument<Job>;
export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ status: 1, publishedAt: -1 });
JobSchema.index({ 'spec.title': 'text', 'spec.department': 'text', 'spec.location': 'text', 'spec.requirements.technicalSkills': 'text' });
