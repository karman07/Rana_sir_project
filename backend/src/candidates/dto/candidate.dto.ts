import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class MoneyDto {
  @IsInt() @Min(0) amount: number; // minor units
  @Matches(/^[A-Za-z]{3}$/) currency: string;
}
class ExperienceDto {
  @IsString() @Length(1, 120) company: string;
  @IsString() @Length(1, 120) title: string;
  @IsOptional() @IsString() @MaxLength(10) startDate?: string; // YYYY-MM
  @IsOptional() @IsString() @MaxLength(10) endDate?: string;
  @IsOptional() @IsBoolean() current?: boolean;
  @IsOptional() @IsString() @MaxLength(1500) description?: string;
}
class EducationDto {
  @IsString() @Length(1, 160) institution: string;
  @IsString() @Length(1, 120) degree: string;
  @IsOptional() @IsString() @MaxLength(120) field?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) startYear?: number;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) endYear?: number;
}

export class UpdateCandidateProfileDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(140) headline?: string;
  @IsOptional() @IsString() @MaxLength(140) currentTitle?: string;
  @IsOptional() @IsString() @MaxLength(3000) about?: string;
  @IsOptional() @IsString() @MaxLength(140) location?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(60, { each: true }) skills?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(60) experienceYears?: number;
  @IsOptional() @ValidateNested() @Type(() => MoneyDto) expectedSalary?: MoneyDto;
  @IsOptional() @IsInt() @Min(0) @Max(365) noticePeriodDays?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ExperienceDto) experience?: ExperienceDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => EducationDto) education?: EducationDto[];
}
