import { Type } from 'class-transformer';
import { JobCommissionDto } from '../jobs/dto/job.dto';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class ApprovalsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsIn(['HIGH', 'MEDIUM', 'NORMAL']) priority?: 'HIGH' | 'MEDIUM' | 'NORMAL';
}

export class ApprovalActionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsBoolean() publish?: boolean;
  /** Our commission, when the item is a job request being approved. */
  @IsOptional() @ValidateNested() @Type(() => JobCommissionDto) commission?: JobCommissionDto;
}
