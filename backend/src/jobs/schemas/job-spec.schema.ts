import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { EmploymentType, WorkMode } from '@rms/shared';

/**
 * The content of an opening. Embedded in JobRequest (what the recruiter submits, editable until approved)
 * and copied into Job on approval (what candidates see, immutable snapshot). Money is integer minor units.
 * Every field is optional at the schema level so drafts can be saved incrementally; completeness is
 * enforced on submit (see job-spec.validation.ts).
 */
@Schema({ _id: false })
export class JobSpec {
  @Prop({ trim: true }) title?: string;
  @Prop({ trim: true }) department?: string;
  @Prop({ trim: true }) location?: string;
  @Prop({ type: String, enum: Object.values(WorkMode) }) workMode?: WorkMode;
  @Prop({ type: String, enum: Object.values(EmploymentType) }) employmentType?: EmploymentType;
  @Prop({ min: 1 }) openings?: number;

  @Prop(raw({
    experienceMin: { type: Number, min: 0 },
    experienceMax: { type: Number, min: 0 },
    education: { type: String },
    technicalSkills: { type: [String], default: [] },
    softSkills: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    languages: { type: [String], default: [] },
  }))
  requirements?: {
    experienceMin?: number; experienceMax?: number; education?: string;
    technicalSkills: string[]; softSkills: string[]; certifications: string[]; languages: string[];
  };

  @Prop(raw({
    salaryMin: { type: Number, min: 0 },
    salaryMax: { type: Number, min: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3 },
    benefits: { type: [String], default: [] },
    bonus: { type: String },
    payBasis: { type: String, enum: ['HOUR', 'MONTH', 'FIXED'], default: 'MONTH' },
    /** How often the person is paid: every day, every week or every month. */
    payFrequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'MONTHLY' },
    hoursPerWeek: { type: Number, min: 1 },
  }))
  compensation?: {
    salaryMin?: number; salaryMax?: number; currency?: string; benefits: string[]; bonus?: string; payBasis?: 'HOUR' | 'MONTH' | 'FIXED'; payFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY'; hoursPerWeek?: number;
  };

  @Prop(raw({
    durationMonths: { type: Number, min: 1 },
    probationMonths: { type: Number, min: 0 },
    workingHours: { type: String },
    noticePeriodDays: { type: Number, min: 0 },
    renewalTerms: { type: String },
  }))
  contract?: { durationMonths?: number; probationMonths?: number; workingHours?: string; noticePeriodDays?: number; renewalTerms?: string };

  @Prop(raw({
    description: { type: String },
    responsibilities: { type: String },
    requirementsText: { type: String },
    /** For our admin team only; never shown to candidates. */
    specialInstructions: { type: String },
    requiredDocuments: { type: [String], default: [] },
  }))
  details?: { description?: string; responsibilities?: string; requirementsText?: string; specialInstructions?: string; requiredDocuments: string[] };
}

export const JobSpecSchema = SchemaFactory.createForClass(JobSpec);
