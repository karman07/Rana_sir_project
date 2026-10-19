import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { DocumentType } from '../schemas/document.schema';

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(DocumentType)) type?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: string;
  @IsOptional() @IsMongoId() ownerId?: string;
}

export class SignLinkDto { @IsOptional() @IsIn([true, false]) inline?: boolean }
