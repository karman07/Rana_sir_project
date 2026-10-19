import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Role } from '@rms/shared';
import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { DocumentsService, type StoredUpload } from './documents.service';
import { ListDocumentsQueryDto } from './dto/document.dto';
import { sanitizeFileName } from './file-validation';
import { DocumentType } from './schemas/document.schema';

/** Types a user may upload directly. Resumes use /candidates/me/resume; contracts and payslips are system-generated. */
const UPLOADABLE = [DocumentType.IDENTIFICATION, DocumentType.CERTIFICATE, DocumentType.COVER_LETTER, DocumentType.OTHER] as const;

export class UploadDocumentDto {
  @IsIn(UPLOADABLE) type: (typeof UPLOADABLE)[number];
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get() mine(@CurrentUser() user: AuthUser) { return this.service.listMine(user); }

  /** Admin: every file in the system. */
  @Roles(Role.ADMIN) @Get('all') all(@Query() q: ListDocumentsQueryDto) { return this.service.listAll(q); }

  /** A short-lived link to one file, usable without a cookie (new tab, another device). */
  @HttpCode(200) @Post(':id/link')
  link(@Param('id', ParseObjectIdPipe) id: string, @Body() body: { inline?: boolean }, @CurrentUser() user: AuthUser) { return this.service.signLink(id, user, body?.inline === true); }

  /** Opens a file from a signed link. The link names who it was issued to and is checked again on use. */
  @Public() @Get('signed')
  async signed(@Query('t') t: string, @Res({ passthrough: true }) res: Response) {
    const { doc, stream, inline } = await this.service.streamSigned(t);
    const disposition = inline && (doc.mime === 'application/pdf' || doc.mime.startsWith('image/')) ? 'inline' : 'attachment';
    res.set({
      'Content-Type': doc.mime, 'Content-Length': String(doc.size), 'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(sanitizeFileName(doc.originalName))}`,
      'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return stream;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: StoredUpload | undefined, @Body() dto: UploadDocumentDto, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException({ message: 'Attach a file', code: 'FILE_REQUIRED' });
    return this.service.register(file, user, { type: dto.type, label: dto.label });
  }

  @Get(':id/download')
  async download(@Param('id', ParseObjectIdPipe) id: string, @Query('inline') inline: string | undefined, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { doc, stream } = await this.service.stream(id, user);
    const disposition = inline === '1' && (doc.mime === 'application/pdf' || doc.mime.startsWith('image/')) ? 'inline' : 'attachment';
    res.set({
      'Content-Type': doc.mime,
      'Content-Length': String(doc.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(sanitizeFileName(doc.originalName))}`,
      'Cache-Control': 'private, no-store',
    });
    return stream;
  }
}
