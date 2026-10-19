import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested, IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PERIOD_MESSAGE, PERIOD_RE } from '../../common/pay-period';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaymentStage } from '../schemas/payment.schema';


const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class GeneratePaymentDto {
  @IsMongoId() contractId: string;
  @Matches(PERIOD_RE, { message: PERIOD_MESSAGE }) period: string;
  /** Hourly contracts: hours worked in the period (defaults to the contract's weekly hours over the month). */
  @IsOptional() @IsInt() @Min(0) @Max(744) hoursWorked?: number;
}

export class AdjustPaymentDto {
  @IsOptional() @IsInt() @Min(0) @Max(744) hoursWorked?: number;
  /** Minor units. */
  @IsOptional() @IsInt() @Min(1) grossAmount?: number;
  @IsString() @Length(3, 500) reason: string;
}

export class MarkPaidDto {
  @IsString() @Length(2, 60) method: string;
  @IsString() @Length(2, 120) reference: string;
  /** Minor units. Defaults to the full amount due. */
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** One transfer from the company covering several candidates' payments. */
export class ReleaseBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsMongoId({ each: true }) paymentIds: string[];
  @IsString() @Length(2, 60) method: string;
  @IsString() @Length(2, 120) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Only for payments released at a different amount than they were due. Minor units. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BatchAmountDto) amounts?: BatchAmountDto[];
}
export class BatchAmountDto {
  @IsMongoId() paymentId: string;
  @IsInt() @Min(1) amount: number;
}

export class ConfirmBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsMongoId({ each: true }) paymentIds: string[];
  /** The total that reached the account, in minor units. */
  @IsInt() @Min(0) amountReceived: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PayoutBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsMongoId({ each: true }) paymentIds: string[];
  @IsString() @Length(2, 60) method: string;
  @IsString() @Length(2, 120) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** A candidate asking for their pay. Leave the period out to ask for the current one. */
export class RequestPayDto {
  @IsOptional() @IsMongoId() contractId?: string;
  @IsOptional() @Matches(PERIOD_RE, { message: PERIOD_MESSAGE }) period?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ConfirmReceivedDto {
  /** Minor units actually received. */
  @IsInt() @Min(0) amountReceived: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PayoutDto {
  @IsString() @Length(2, 60) method: string;
  @IsString() @Length(2, 120) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class NoteRequiredDto { @IsString() @Length(3, 500) note: string }

export class ProofQueryDto { @IsIn(['client', 'payout']) leg: 'client' | 'payout' }

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value)) @IsIn(Object.values(PaymentStage), { each: true }) statuses?: string[];
  @IsOptional() @Matches(PERIOD_RE, { message: PERIOD_MESSAGE }) period?: string;
  @IsOptional() @IsMongoId() contractId?: string;
  @IsOptional() @IsMongoId() candidateId?: string;
  @IsOptional() @Transform(bool) @IsBoolean() overdue?: boolean;
  /** Only payments a candidate has asked for. */
  @IsOptional() @Transform(bool) @IsBoolean() requested?: boolean;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['CLIENT_RECEIPT', 'COMMISSION', 'CANDIDATE_PAYOUT', 'REVERSAL']) type?: string;
  @IsOptional() @Matches(PERIOD_RE, { message: PERIOD_MESSAGE }) period?: string;
}
