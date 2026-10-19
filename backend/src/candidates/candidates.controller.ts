import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { StoredUpload } from '../documents/documents.service';
import { CandidatesService } from './candidates.service';
import { UpdateCandidateProfileDto } from './dto/candidate.dto';

@Controller('candidates/me')
@Roles(Role.CANDIDATE)
export class CandidatesController {
  constructor(private readonly service: CandidatesService) {}

  @Get() me(@CurrentUser() u: AuthUser) { return this.service.getMe(u); }
  @Patch() update(@Body() dto: UpdateCandidateProfileDto, @CurrentUser() u: AuthUser) { return this.service.updateMe(u, dto); }

  @Post('resume')
  @UseInterceptors(FileInterceptor('file'))
  resume(@UploadedFile() file: StoredUpload | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException({ message: 'Attach your resume', code: 'FILE_REQUIRED' });
    return this.service.uploadResume(u, file);
  }

  @Put('saved-jobs/:jobId') @HttpCode(200)
  save(@Param('jobId', ParseObjectIdPipe) jobId: string, @CurrentUser() u: AuthUser) { return this.service.saveJob(u, jobId); }

  @Delete('saved-jobs/:jobId')
  unsave(@Param('jobId', ParseObjectIdPipe) jobId: string, @CurrentUser() u: AuthUser) { return this.service.unsaveJob(u, jobId); }
}
