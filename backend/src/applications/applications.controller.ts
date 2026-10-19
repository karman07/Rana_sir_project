import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ApplicationsService } from './applications.service';
import { ApplyDto, ListApplicationsQueryDto, TransitionDto, WithdrawDto } from './dto/application.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Roles(Role.CANDIDATE) @Post()
  apply(@Body() dto: ApplyDto, @CurrentUser() u: AuthUser) { return this.service.apply(dto, u); }

  /** Candidates: their own. Admin: all. Recruiters: only candidates sent to them. */
  @Get() list(@Query() q: ListApplicationsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('counts') counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }
  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  /** Every status change goes through the workflow service; invalid moves are refused (Admin may override with a reason). */
  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @Patch(':id/status')
  status(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TransitionDto, @CurrentUser() u: AuthUser) { return this.service.transition(id, dto, u); }

  @Roles(Role.CANDIDATE) @HttpCode(200) @Post(':id/withdraw')
  withdraw(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: WithdrawDto, @CurrentUser() u: AuthUser) { return this.service.withdraw(id, u, dto.reason); }
}
