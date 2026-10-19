import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ReviewStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/** A recruiter is an agent who posts openings on behalf of several client companies. Admin approves the account. */
@Schema({ timestamps: true })
export class RecruiterProfile extends BaseEntity {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ trim: true }) agencyName?: string;

  @Prop({ type: String, enum: Object.values(ReviewStatus), default: ReviewStatus.PENDING_REVIEW, index: true })
  approvalStatus: ReviewStatus;

  @Prop() submittedAt?: Date;
  @Prop({ type: 'ObjectId', ref: 'User' }) reviewedBy?: Types.ObjectId;
  @Prop() reviewedAt?: Date;
  @Prop() reviewNote?: string;
  /** Set when Admin created the account from the panel. */
  @Prop({ type: 'ObjectId', ref: 'User' }) createdByAdmin?: Types.ObjectId;
}

export type RecruiterProfileDocument = HydratedDocument<RecruiterProfile>;
export const RecruiterProfileSchema = SchemaFactory.createForClass(RecruiterProfile);
RecruiterProfileSchema.index({ approvalStatus: 1, submittedAt: 1 });
