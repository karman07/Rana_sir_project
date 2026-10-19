import { IsInt, IsMongoId, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
import { PERIOD_MESSAGE, PERIOD_RE } from "../../common/pay-period";

export class SubmitHoursDto { @IsInt() @Min(0) @Max(744) hoursWorked: number }

export class ReportDelayDto {
  @IsString() @Length(5, 500) reason: string;
  /** The day pay is now expected. */
  @Matches(DATE, { message: 'Use the format YYYY-MM-DD' }) newPayDate: string;
}

export class PublishDelayDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Admin may correct what the candidate will be told. */
  @IsOptional() @IsString() @Length(5, 500) reason?: string;
  @IsOptional() @Matches(DATE) newPayDate?: string;
}

export class RejectDelayDto { @IsString() @Length(3, 500) note: string }

export class ListSalariesQueryDto extends PaginationQueryDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value)) @IsIn(['UPCOMING', 'PENDING', 'PROCESSING', 'PAID', 'DELAYED', 'DISPUTED'], { each: true }) statuses?: string[];
  @IsOptional() @Matches(PERIOD_RE, { message: PERIOD_MESSAGE }) period?: string;
  @IsOptional() @IsMongoId() contractId?: string;
  @IsOptional() @IsMongoId() candidateId?: string;
}
