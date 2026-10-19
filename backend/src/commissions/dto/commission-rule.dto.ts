import { IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { RuleScope } from '../schemas/commission-rule.schema';

export class CreateCommissionRuleDto {
  @IsIn(Object.values(RuleScope)) scope: RuleScope;
  @IsOptional() @IsMongoId() refId?: string;
  @IsIn(['PERCENT', 'FIXED']) type: 'PERCENT' | 'FIXED';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) percent?: number;
  /** Minor units. */
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ResolveRuleQueryDto {
  @IsOptional() @IsMongoId() recruiterId?: string;
  @IsOptional() @IsMongoId() jobId?: string;
}
