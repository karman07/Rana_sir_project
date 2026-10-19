import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { ApplicationStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

@Schema({ _id: false })
export class StatusChange {
  @Prop({ type: String, enum: Object.values(ApplicationStatus), required: true }) status: ApplicationStatus;
  @Prop({ type: 'ObjectId', ref: 'User' }) changedBy?: Types.ObjectId;
  @Prop() changedByName?: string;
  @Prop() role?: string;
  @Prop({ default: () => new Date() }) at: Date;
  @Prop() reason?: string;
  @Prop() notes?: string;
  /** True when Admin forced a transition the normal workflow does not allow. */
  @Prop() override?: boolean;
}
const StatusChangeSchema = SchemaFactory.createForClass(StatusChange);

/**
 * A candidate's application to a job. `status` is only ever changed through RecruitmentWorkflowService,
 * which appends to `statusHistory` in the same atomic update.
 */
@Schema({ timestamps: true })
export class Application extends BaseEntity {
  @Prop({ required: true, unique: true }) applicationNumber: string;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) candidateId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Job', required: true, index: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true, index: true }) companyId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ApplicationStatus), default: ApplicationStatus.APPLIED, index: true })
  status: ApplicationStatus;
  @Prop({ type: [StatusChangeSchema], default: [] }) statusHistory: StatusChange[];

  @Prop({ type: 'ObjectId', ref: 'DocumentFile' }) resumeDocumentId?: Types.ObjectId;
  @Prop() coverLetter?: string;
  @Prop(raw({ amount: { type: Number, min: 0 }, currency: { type: String, uppercase: true } })) expectedSalary?: { amount: number; currency: string };
  @Prop({ min: 0 }) noticePeriodDays?: number;
  @Prop() relevantInfo?: string;
  @Prop({ type: [raw({ label: { type: String }, documentId: { type: 'ObjectId', ref: 'DocumentFile' } })], default: [] })
  documents: { label: string; documentId: Types.ObjectId }[];

  /** Admin screening (extended in Part 10) and recruiter feedback. */
  @Prop({ min: 0, max: 100 }) adminScore?: number;
  @Prop({ min: 0, max: 100 }) resumeScore?: number;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop() adminNotes?: string;
  @Prop({ min: 0, max: 100 }) recruiterScore?: number;
  @Prop() recruiterNotes?: string;
  /** Set when a recruiter sends a candidate back to Admin; Admin decides what happens next (spec §26). */
  @Prop(raw({ type: { type: String }, reason: { type: String }, at: { type: Date }, byName: { type: String }, pending: { type: Boolean } }))
  recruiterDecision?: { type: 'REJECTED' | 'CHANGES_REQUESTED'; reason: string; at: Date; byName?: string; pending: boolean };

  createdAt: Date;
  updatedAt: Date;
}

export type ApplicationDocument = HydratedDocument<Application>;
export const ApplicationSchema = SchemaFactory.createForClass(Application);
// One application per candidate per job.
ApplicationSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
ApplicationSchema.index({ status: 1, createdAt: -1 });
ApplicationSchema.index({ jobId: 1, status: 1 });
ApplicationSchema.index({ recruiterId: 1, status: 1 });
