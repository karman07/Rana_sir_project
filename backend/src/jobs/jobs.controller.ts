import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { JobCommissionDto, PublishJobDto, ApproveJobRequestDto, CloseJobDto, CreateJobRequestDto, JobDecisionReasonDto, ListJobRequestsQueryDto, ListJobsQueryDto, UpdateJobRequestDto } from './dto/job.dto';
import { JobRequestsService } from './job-requests.service';
import { JobsService } from './jobs.service';
import { JobChangesService } from './job-changes.service';
import { CreateJobChangeDto, DecisionNoteDto, ListJobChangesQueryDto, RejectChangeDto } from './dto/job-change.dto';

@Controller('job-requests')
export class JobRequestsController {
  constructor(private readonly service: JobRequestsService) {}

  @Roles(Role.ADMIN, Role.RECRUITER) @Get()
  list(@Query() q: ListJobRequestsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Get('counts')
  counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.RECRUITER) @RequireApprovedRecruiter() @Post()
  create(@Body() dto: CreateJobRequestDto, @CurrentUser() u: AuthUser) { return this.service.create(dto, u); }

  @Roles(Role.RECRUITER, Role.ADMIN) @RequireApprovedRecruiter() @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateJobRequestDto, @CurrentUser() u: AuthUser) { return this.service.update(id, dto, u); }

  @Roles(Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/submit')
  submit(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.submit(id, u); }

  @Roles(Role.RECRUITER) @RequireApprovedRecruiter() @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.remove(id, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ApproveJobRequestDto, @CurrentUser() u: AuthUser) { return this.service.approve(id, u, dto.note, dto.publish ?? true, dto.commission); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/request-changes')
  requestChanges(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: JobDecisionReasonDto, @CurrentUser() u: AuthUser) { return this.service.requestChanges(id, u, dto.note); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: JobDecisionReasonDto, @CurrentUser() u: AuthUser) { return this.service.reject(id, u, dto.note); }
}

@Controller('job-changes')
export class JobChangesController {
  constructor(private readonly service: JobChangesService) {}

  @Roles(Role.ADMIN, Role.RECRUITER) @Get()
  list(@Query() q: ListJobChangesQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Get('counts')
  counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.RECRUITER) @HttpCode(200) @Post(':id/cancel')
  cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.cancel(id, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: DecisionNoteDto, @CurrentUser() u: AuthUser) { return this.service.approve(id, u, dto.note); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RejectChangeDto, @CurrentUser() u: AuthUser) { return this.service.reject(id, u, dto.note); }
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService, private readonly changes: JobChangesService, private readonly requests: JobRequestsService) {}

  /** Candidates: published jobs only. Recruiters: their own. Admin: everything. */
  @Get()
  list(@Query() q: ListJobsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }

  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.RECRUITER) @RequireApprovedRecruiter() @Post(':id/change-requests')
  requestChange(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateJobChangeDto, @CurrentUser() u: AuthUser) { return this.changes.create(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/publish')
  publish(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: PublishJobDto, @CurrentUser() u: AuthUser) { return this.service.publish(id, u, dto.commission); }

  /** Our commission on this opening. Admin only, and never shown to anyone else. */
  @Roles(Role.ADMIN) @Put(':id/commission')
  setCommission(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: JobCommissionDto, @CurrentUser() u: AuthUser) { return this.service.setCommission(id, dto, u); }

  /** Admin can adjust an approved opening as much as needed before it goes live. */
  @Roles(Role.ADMIN) @Patch(':id')
  edit(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateJobRequestDto, @CurrentUser() u: AuthUser) { return this.requests.adminEditJob(id, dto, u); }

  /** Admin closes directly; recruiters ask through a change request. */
  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/close')
  close(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CloseJobDto, @CurrentUser() u: AuthUser) { return this.service.close(id, u, dto.reason); }
}
