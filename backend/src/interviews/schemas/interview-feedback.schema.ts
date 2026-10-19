import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { InterviewRecommendation } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'interviewfeedback' })
export class InterviewFeedback {
  @Prop({ type: 'ObjectId', ref: 'Interview', required: true, index: true }) interviewId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'Application', required: true, index: true }) applicationId: Types.ObjectId;
  @Prop({ type: 'ObjectId', ref: 'User', required: true }) authorId: Types.ObjectId;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) authorRole: string;

  @Prop({ required: true, min: 1, max: 5 }) overallRating: number;
  @Prop({ min: 1, max: 5 }) technicalRating?: number;
  @Prop({ min: 1, max: 5 }) communicationRating?: number;
  @Prop({ min: 1, max: 5 }) cultureFit?: number;
  @Prop() strengths?: string;
  @Prop() weaknesses?: string;
  @Prop({ type: String, enum: Object.values(InterviewRecommendation), required: true }) recommendation: InterviewRecommendation;
  @Prop() notes?: string;
  createdAt: Date;
}

export type InterviewFeedbackDocument = HydratedDocument<InterviewFeedback>;
export const InterviewFeedbackSchema = SchemaFactory.createForClass(InterviewFeedback);
// One piece of feedback per person per interview; they can revise it.
InterviewFeedbackSchema.index({ interviewId: 1, authorId: 1 }, { unique: true });
