import { Type } from 'class-transformer';
import { IsIn, IsMongoId, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JobSpecDto } from './job-spec.dto';

export class CreateJobChangeDto {
  @IsIn(['EDIT', 'CLOSE']) type: 'EDIT' | 'CLOSE';
  /** Why the change is needed (an edit) or why the opening should end (a closure). */
  @IsString() @Length(5, 500) reason: string;
  /** The updated opening, for an edit. Fields left out stay as they are. */
  @IsOptional() @ValidateNested() @Type(() => JobSpecDto) spec?: JobSpecDto;
}

export class DecisionNoteDto { @IsOptional() @IsString() @Length(0, 500) note?: string }
export class RejectChangeDto { @IsString() @Length(3, 500) note: string }

export class ListJobChangesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['EDIT', 'CLOSE']) type?: string;
  @IsOptional() @IsMongoId() jobId?: string;
}
