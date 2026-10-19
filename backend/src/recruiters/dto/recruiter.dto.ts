import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { ReviewStatus } from '@rms/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateRecruiterDto {
  @IsString() @Length(2, 80) name: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(120) agencyName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
}

export class BulkCreateRecruitersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CreateRecruiterDto)
  recruiters: CreateRecruiterDto[];
}

export class ListRecruitersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(ReviewStatus)) approvalStatus?: ReviewStatus;
}

export class ReviewDecisionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class RequiredReasonDto {
  @IsString() @Length(3, 1000) note: string;
}
