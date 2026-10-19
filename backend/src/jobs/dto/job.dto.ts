import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EmploymentType, JobRequestStatus, JobStatus, WorkMode } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JobSpecDto } from './job-spec.dto';

export class CreateJobRequestDto {
  @IsMongoId() companyId: string;
  @IsOptional() @ValidateNested() @Type(() => JobSpecDto) spec?: JobSpecDto;
}

export class UpdateJobRequestDto {
  /** Company can only change while the request has never been submitted. */
  @IsOptional() @IsMongoId() companyId?: string;
  @IsOptional() @ValidateNested() @Type(() => JobSpecDto) spec?: JobSpecDto;
}

export class ListJobRequestsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(JobRequestStatus)) status?: JobRequestStatus;
  @IsOptional() @IsMongoId() companyId?: string;
  @IsOptional() @IsMongoId() recruiterId?: string;
}

export class JobCommissionDto {
  @IsIn(['PERCENT', 'FIXED']) type: 'PERCENT' | 'FIXED';
  /** 0-99.99, for PERCENT. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(99.99) percent?: number;
  /** Minor units per payment, for FIXED. */
  @IsOptional() @IsInt() @Min(1) amount?: number;
}

export class PublishJobDto {
  /** Needed only if no commission has been set for this opening yet. */
  @IsOptional() @ValidateNested() @Type(() => JobCommissionDto) commission?: JobCommissionDto;
}

export class ApproveJobRequestDto {
  /** Our commission on this opening. Never shown to the recruiter or candidates. */
  @IsOptional() @ValidateNested() @Type(() => JobCommissionDto) commission?: JobCommissionDto;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Publish immediately (default) or leave APPROVED to publish later. */
  @IsOptional() @IsBoolean() publish?: boolean;
}
export class JobDecisionReasonDto {
  @IsString() @Length(3, 1000) note: string;
}

const bool = () => Transform(({ value }) => value === 'true' || value === true);

/** Filters shared by the candidate-facing job search and staff lists. */
export class ListJobsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(JobStatus)) status?: JobStatus;
  @IsOptional() @IsMongoId() companyId?: string;
  @IsOptional() @IsString() @MaxLength(100) location?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsIn(Object.values(EmploymentType)) employmentType?: EmploymentType;
  @IsOptional() @IsIn(Object.values(WorkMode)) workMode?: WorkMode;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) maxExperience?: number;
  /** Minor units, compared against the top of the posted range. Requires `currency`. */
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) minSalary?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(60) skill?: string;
  @IsOptional() @bool() @IsBoolean() remote?: boolean;
  /** Candidates only: restrict to jobs they saved. */
  @IsOptional() @bool() @IsBoolean() saved?: boolean;
}

export class CloseJobDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
