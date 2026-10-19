import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ReviewStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/** Many-to-many: which client companies a recruiter may post for. Each link is admin-approved. */
@Schema({ timestamps: true })
export class RecruiterCompany extends BaseEntity {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterUserId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Company', required: true, index: true }) companyId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ReviewStatus), default: ReviewStatus.PENDING_REVIEW })
  approvalStatus: ReviewStatus;
  @Prop({ type: 'ObjectId', ref: 'User' }) reviewedBy?: Types.ObjectId;
  @Prop() reviewedAt?: Date;
  @Prop() reviewNote?: string;
}

export type RecruiterCompanyDocument = HydratedDocument<RecruiterCompany>;
export const RecruiterCompanySchema = SchemaFactory.createForClass(RecruiterCompany);
RecruiterCompanySchema.index({ recruiterUserId: 1, companyId: 1 }, { unique: true });
