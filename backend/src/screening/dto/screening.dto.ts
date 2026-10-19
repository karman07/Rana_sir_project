import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsMongoId, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class ScreenDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) adminScore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) resumeScore?: number;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
}

export class ShortlistDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 1000) reason: string;
}

export class SendToRecruiterDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsMongoId({ each: true }) applicationIds: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RecruiterApproveDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}

export class RequestMoreCandidatesDto {
  @IsInt() @Min(1) @Max(100) count: number;
  @IsString() @Length(5, 1500) reason: string;
  @IsOptional() @IsString() @MaxLength(3000) updatedRequirements?: string;
  @IsOptional() @IsString() @MaxLength(2000) comments?: string;
}
