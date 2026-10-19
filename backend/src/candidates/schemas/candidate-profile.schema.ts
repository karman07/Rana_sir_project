import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

@Schema({ _id: false })
class MoneyAmount {
  @Prop({ required: true }) amount: number; // minor units
  @Prop({ required: true }) currency: string;
}

/** Extended in Part 8 (resume, education, experience entries, ...). */
@Schema({ timestamps: true })
export class CandidateProfile extends BaseEntity {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop() headline?: string;
  @Prop() about?: string;
  @Prop() currentTitle?: string;
  @Prop() location?: string;
  @Prop({ type: [String], default: [] }) skills: string[];
  @Prop({ min: 0 }) experienceYears?: number;
  @Prop({ type: MoneyAmount }) expectedSalary?: MoneyAmount;
  @Prop() noticePeriodDays?: number;

  @Prop({ type: [raw({ company: String, title: String, startDate: String, endDate: String, current: Boolean, description: String })], default: [] })
  experience: { company: string; title: string; startDate?: string; endDate?: string; current?: boolean; description?: string }[];

  @Prop({ type: [raw({ institution: String, degree: String, field: String, startYear: Number, endYear: Number })], default: [] })
  education: { institution: string; degree: string; field?: string; startYear?: number; endYear?: number }[];

  @Prop({ type: ['ObjectId'], ref: 'Job', default: [] }) savedJobIds: Types.ObjectId[];
}

export type CandidateProfileDocument = HydratedDocument<CandidateProfile>;
export const CandidateProfileSchema = SchemaFactory.createForClass(CandidateProfile);
