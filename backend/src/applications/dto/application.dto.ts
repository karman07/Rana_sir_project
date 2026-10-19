import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { ApplicationStatus } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class SalaryDto {
  @IsInt() @Min(0) amount: number; // minor units
  @Matches(/^[A-Za-z]{3}$/) currency: string;
}
class AttachedDocDto {
  @IsString() @Length(1, 120) label: string;
  @IsMongoId() documentId: string;
}

export class ApplyDto {
  @IsMongoId() jobId: string;
  @IsOptional() @IsString() @MaxLength(5000) coverLetter?: string;
  @IsOptional() @ValidateNested() @Type(() => SalaryDto) expectedSalary?: SalaryDto;
  @IsOptional() @IsInt() @Min(0) noticePeriodDays?: number;
  @IsOptional() @IsString() @MaxLength(3000) relevantInfo?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => AttachedDocDto) documents?: AttachedDocDto[];
}

export class TransitionDto {
  @IsIn(Object.values(ApplicationStatus)) status: ApplicationStatus;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** Admin only: force a transition the normal workflow does not allow (needs a reason, is audited). */
  @IsOptional() @IsBoolean() override?: boolean;
}

export class WithdrawDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(ApplicationStatus)) status?: ApplicationStatus;
  @IsOptional() @IsMongoId() jobId?: string;
  @IsOptional() @IsMongoId() candidateId?: string;
  /** Comma-separated statuses (e.g. open pipeline views). */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value)) @IsIn(Object.values(ApplicationStatus), { each: true }) statuses?: ApplicationStatus[];
}
