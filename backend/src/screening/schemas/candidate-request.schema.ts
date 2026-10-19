import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

/** A recruiter asking Admin for more candidates for an opening (spec §27). */
@Schema({ timestamps: true })
export class CandidateRequest extends BaseEntity {
  @Prop({ type: 'ObjectId', ref: 'Job', required: true, index: true }) jobId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) recruiterId: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 100 }) count: number;
  @Prop({ required: true }) reason: string;
  @Prop() updatedRequirements?: string;
  @Prop() comments?: string;
  @Prop({ type: String, enum: ['PENDING', 'HANDLED', 'DECLINED'], default: 'PENDING', index: true }) status: 'PENDING' | 'HANDLED' | 'DECLINED';
  @Prop({ type: 'ObjectId', ref: 'User' }) decidedBy?: Types.ObjectId;
  @Prop() decidedAt?: Date;
  @Prop() decisionNote?: string;
  createdAt: Date;
}

export type CandidateRequestDocument = HydratedDocument<CandidateRequest>;
export const CandidateRequestSchema = SchemaFactory.createForClass(CandidateRequest);
