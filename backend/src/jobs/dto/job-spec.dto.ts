import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { EmploymentType, WorkMode } from '@rms/shared';

const list = () => [IsOptional(), IsArray(), ArrayMaxSize(30), IsString({ each: true }), MaxLength(80, { each: true })];
const apply = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => d.forEach((f) => f(t, k));

class RequirementsDto {
  @IsOptional() @IsInt() @Min(0) experienceMin?: number;
  @IsOptional() @IsInt() @Min(0) experienceMax?: number;
  @IsOptional() @IsString() @MaxLength(200) education?: string;
  @apply(...list()) technicalSkills?: string[];
  @apply(...list()) softSkills?: string[];
  @apply(...list()) certifications?: string[];
  @apply(...list()) languages?: string[];
}

class CompensationDto {
  /** Integer minor units (e.g. paise/cents). */
  @IsOptional() @IsInt() @Min(0) salaryMin?: number;
  @IsOptional() @IsInt() @Min(0) salaryMax?: number;
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @apply(...list()) benefits?: string[];
  @IsOptional() @IsString() @MaxLength(300) bonus?: string;
  /** How the range is paid: per hour, per month, or one fixed amount for the job. */
  @IsOptional() @IsIn(['HOUR', 'MONTH', 'FIXED']) payBasis?: 'HOUR' | 'MONTH' | 'FIXED';
  @IsOptional() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) payFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  @IsOptional() @IsInt() @Min(1) @Max(80) hoursPerWeek?: number;
}

class ContractDto {
  @IsOptional() @IsInt() @Min(1) durationMonths?: number;
  @IsOptional() @IsInt() @Min(0) probationMonths?: number;
  @IsOptional() @IsString() @MaxLength(200) workingHours?: string;
  @IsOptional() @IsInt() @Min(0) noticePeriodDays?: number;
  @IsOptional() @IsString() @MaxLength(500) renewalTerms?: string;
}

class DetailsDto {
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsString() @MaxLength(8000) responsibilities?: string;
  @IsOptional() @IsString() @MaxLength(8000) requirementsText?: string;
  @IsOptional() @IsString() @MaxLength(4000) specialInstructions?: string;
  @apply(...list()) requiredDocuments?: string[];
}

/** Everything optional: drafts are saved incrementally. Completeness is checked on submit. */
export class JobSpecDto {
  @IsOptional() @IsString() @Length(2, 140) title?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsString() @MaxLength(140) location?: string;
  @IsOptional() @IsIn(Object.values(WorkMode)) workMode?: WorkMode;
  @IsOptional() @IsIn(Object.values(EmploymentType)) employmentType?: EmploymentType;
  @IsOptional() @IsInt() @Min(1) openings?: number;
  @IsOptional() @ValidateNested() @Type(() => RequirementsDto) requirements?: RequirementsDto;
  @IsOptional() @ValidateNested() @Type(() => CompensationDto) compensation?: CompensationDto;
  @IsOptional() @ValidateNested() @Type(() => ContractDto) contract?: ContractDto;
  @IsOptional() @ValidateNested() @Type(() => DetailsDto) details?: DetailsDto;
}
