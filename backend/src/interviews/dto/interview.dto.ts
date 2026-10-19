import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { InterviewRecommendation, InterviewStatus } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InterviewType } from '../schemas/interview.schema';

class InterviewerDto {
  @IsString() @Length(1, 80) name: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
}

const SAFE_LINK = /^https?:\/\/[^\s]+$/i;

class InterviewDetails {
  @IsOptional() @IsIn(Object.values(InterviewType)) type?: InterviewType;
  @IsOptional() @IsInt() @Min(10) @Max(480) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @ValidateIf((o) => o.meetingLink !== undefined && o.meetingLink !== '') @Matches(SAFE_LINK, { message: 'Meeting link must start with http:// or https://' }) @MaxLength(500) meetingLink?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(30) phoneNumber?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => InterviewerDto) interviewers?: InterviewerDto[];
  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateInterviewDto extends InterviewDetails {
  @IsMongoId() applicationId: string;
  @IsIn(Object.values(InterviewType)) declare type: InterviewType;
  @IsISO8601() startsAt: string;
  @IsInt() @Min(10) @Max(480) declare durationMinutes: number;
}

export class UpdateInterviewDto extends InterviewDetails {
  /** A different start time reschedules: the old interview is marked RESCHEDULED and a new one is created. */
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReasonOptionalDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class CancelDto {
  @IsString() @Length(3, 500) reason: string;
}

const rating = () => [IsInt(), Min(1), Max(5)];
const r = (target: object, key: string) => rating().forEach((d) => d(target, key));
export class FeedbackDto {
  @r overallRating: number;
  @IsOptional() @r technicalRating?: number;
  @IsOptional() @r communicationRating?: number;
  @IsOptional() @r cultureFit?: number;
  @IsOptional() @IsString() @MaxLength(2000) strengths?: string;
  @IsOptional() @IsString() @MaxLength(2000) weaknesses?: string;
  @IsIn(Object.values(InterviewRecommendation)) recommendation: InterviewRecommendation;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}

export class ListInterviewsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(InterviewStatus)) status?: InterviewStatus;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) upcoming?: boolean;
  @IsOptional() @IsMongoId() applicationId?: string;
  @IsOptional() @IsIn(['ADMIN', 'RECRUITER']) stage?: 'ADMIN' | 'RECRUITER';
}
