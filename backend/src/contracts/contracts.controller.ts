import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { ParseIntPipe } from '@nestjs/common';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ContractsService } from './contracts.service';
import { ChangeContractDto, CreateContractDto, ListContractsQueryDto, NoteDto, ReasonDto, TerminateDto, TermsDto } from './dto/contract.dto';

@Controller('contracts')
@RequireApprovedRecruiter()
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  /** Admin: all. Recruiter: their candidates'. Candidate: their own, once a contract has been put to them. */
  @Get() list(@Query() q: ListContractsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('counts') counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post('lifecycle/run')
  lifecycle() { return this.service.runLifecycle(); }

  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() u: AuthUser) { return this.service.create(dto, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TermsDto, @CurrentUser() u: AuthUser) { return this.service.updateDraft(id, dto, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post(':id/submit')
  submit(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.submit(id, u); }

  /** Approves on behalf of whichever party the contract is currently waiting for (Admin, recruiter, then candidate). */
  @HttpCode(200) @Post(':id/approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteDto, @CurrentUser() u: AuthUser) { return this.service.approve(id, u, dto.note); }

  @HttpCode(200) @Post(':id/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.reject(id, u, dto.reason); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/terminate')
  terminate(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TerminateDto, @CurrentUser() u: AuthUser) { return this.service.terminate(id, u, dto.reason); }

  /** A change creates a new version; the current one is never edited. */
  @Roles(Role.ADMIN, Role.RECRUITER) @Post(':id/versions')
  change(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ChangeContractDto, @CurrentUser() u: AuthUser) { return this.service.requestChange(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/versions/:version/approve')
  approveChange(@Param('id', ParseObjectIdPipe) id: string, @Param('version', ParseIntPipe) v: number, @Body() dto: NoteDto, @CurrentUser() u: AuthUser) { return this.service.decideChange(id, v, 'approve', u, dto.note); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/versions/:version/reject')
  rejectChange(@Param('id', ParseObjectIdPipe) id: string, @Param('version', ParseIntPipe) v: number, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.decideChange(id, v, 'reject', u, dto.reason); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/versions/:version/request-changes')
  requestChanges(@Param('id', ParseObjectIdPipe) id: string, @Param('version', ParseIntPipe) v: number, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.decideChange(id, v, 'request-changes', u, dto.reason); }
}
