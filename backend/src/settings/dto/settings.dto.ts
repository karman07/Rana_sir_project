import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@rms/shared';

class CompanyDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) legalName?: string;
  @IsOptional() @IsEmail() supportEmail?: string | '';
  @IsOptional() @IsString() @MaxLength(40) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string | '';
}
class DefaultsDto {
  @IsOptional() @IsIn([...SUPPORTED_CURRENCIES]) currency?: string;
}
class PaymentsDto {
  /** Days after a month ends that the company has to pay. */
  @IsOptional() @IsInt() @Min(0) @Max(60) dueGraceDays?: number;
  /** Days after a month ends that a candidate is expected to be paid. */
  @IsOptional() @IsInt() @Min(0) @Max(60) salaryPayLagDays?: number;
}
class DocumentsDto {
  @IsOptional() @IsInt() @Min(1) @Max(25) maxUploadMb?: number;
}

export class UpdateSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => CompanyDto) company?: CompanyDto;
  @IsOptional() @ValidateNested() @Type(() => DefaultsDto) defaults?: DefaultsDto;
  @IsOptional() @ValidateNested() @Type(() => PaymentsDto) payments?: PaymentsDto;
  @IsOptional() @ValidateNested() @Type(() => DocumentsDto) documents?: DocumentsDto;
}
