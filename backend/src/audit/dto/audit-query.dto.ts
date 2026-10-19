import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(50) entityType?: string;
  @IsOptional() @IsString() @MaxLength(50) entityId?: string;
  @IsOptional() @IsMongoId() actorId?: string;
  @IsOptional() @IsString() @MaxLength(60) action?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
