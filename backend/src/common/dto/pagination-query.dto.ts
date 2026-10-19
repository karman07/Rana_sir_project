import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  /** `field` or `-field` for descending. Whitelisted per endpoint via `paginate({ sortable })`. */
  @IsOptional() @IsString() @MaxLength(50)
  sort?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
