import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ReviewStatus } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/** Client company. Created by a recruiter or Admin; Admin approves before jobs can be posted for it. */
@Schema({ timestamps: true })
export class Company extends BaseEntity {
  @Prop({ required: true, trim: true, index: true }) name: string;
  @Prop() industry?: string;
  @Prop() website?: string;
  @Prop() location?: string;
  @Prop() country?: string;
  @Prop() logoUrl?: string;

  @Prop({ type: String, enum: Object.values(ReviewStatus), default: ReviewStatus.PENDING_REVIEW, index: true })
  approvalStatus: ReviewStatus;
  @Prop() submittedAt?: Date;
  @Prop({ type: 'ObjectId', ref: 'User' }) reviewedBy?: Types.ObjectId;
  @Prop() reviewedAt?: Date;
  @Prop() reviewNote?: string;
  @Prop({ type: 'ObjectId', ref: 'User' }) createdBy?: Types.ObjectId;
}

export type CompanyDocument = HydratedDocument<Company>;
export const CompanySchema = SchemaFactory.createForClass(Company);
