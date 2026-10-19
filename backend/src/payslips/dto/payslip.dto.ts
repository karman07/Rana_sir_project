import { IsMongoId, IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GeneratePayslipDto { @IsMongoId() paymentId: string }

export class ListPayslipsQueryDto extends PaginationQueryDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period?: string;
  @IsOptional() @IsMongoId() candidateId?: string;
}
