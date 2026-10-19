import { IsIn, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { ReviewStatus } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateCompanyDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsString() @MaxLength(80) industry?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
}

export class ListCompaniesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(ReviewStatus)) approvalStatus?: ReviewStatus;
}

export class CompanyDecisionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class CompanyReasonDto {
  @IsString() @Length(3, 1000) note: string;
}
