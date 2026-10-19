import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { ContractStatus, EmploymentType } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class TermsDto {
  @IsOptional() @IsString() @Length(2, 140) title?: string;
  @IsOptional() @IsIn(Object.values(EmploymentType)) employmentType?: EmploymentType;
  /** Whole minor units (paise/cents). */
  @IsOptional() @IsInt() @Min(1) salaryAmount?: number;
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsIn(['HOUR', 'MONTH', 'YEAR']) salaryPeriod?: 'HOUR' | 'MONTH' | 'YEAR';
  /** Expected weekly hours; required when paid hourly. */
  @IsOptional() @IsInt() @Min(1) @Max(80) hoursPerWeek?: number;
  /** Platform commission. Only Admin may set these; they are ignored from recruiters. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsInt() @Min(0) commissionFixed?: number;
  @IsOptional() @Matches(DATE, { message: 'Use the format YYYY-MM-DD' }) startDate?: string;
  @IsOptional() @Matches(DATE, { message: 'Use the format YYYY-MM-DD' }) endDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36) probationMonths?: number;
  @IsOptional() @IsString() @MaxLength(200) workingHours?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) noticePeriodDays?: number;
  @IsOptional() @IsString() @MaxLength(1000) renewalTerms?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateContractDto extends TermsDto {
  @IsMongoId() applicationId: string;
}

export class ChangeContractDto extends TermsDto {
  @IsString() @Length(3, 1000) reason: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class ReasonDto {
  @IsString() @Length(3, 1000) reason: string;
}
export class TerminateDto {
  @IsString() @Length(3, 1000) reason: string;
}

export class ListContractsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(ContractStatus)) status?: ContractStatus;
  /** Comma-separated statuses. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value)) @IsIn(Object.values(ContractStatus), { each: true }) statuses?: ContractStatus[];
  /** Contracts ending within this many days (and not yet over). */
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(365) endingWithinDays?: number;
  @IsOptional() @IsMongoId() applicationId?: string;
  @IsOptional() @IsMongoId() candidateId?: string;
}
