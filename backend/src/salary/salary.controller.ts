import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListSalariesQueryDto, PublishDelayDto, RejectDelayDto, ReportDelayDto, SubmitHoursDto } from './dto/salary.dto';
import { SalaryService } from './salary.service';

@Controller('salaries')
@RequireApprovedRecruiter()
export class SalaryController {
  constructor(private readonly service: SalaryService) {}

  /** Admin: all. Recruiter: their contracts'. Candidate: their own. */
  @Get() list(@Query() q: ListSalariesQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('counts') counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post('generate')
  generate() { return this.service.runGeneration(); }

  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post(':id/hours')
  hours(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: SubmitHoursDto, @CurrentUser() u: AuthUser) { return this.service.submitHours(id, dto.hoursWorked, u); }

  /** A recruiter's report waits for Admin; an Admin's is published straight away. */
  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post(':id/delay')
  delay(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReportDelayDto, @CurrentUser() u: AuthUser) { return this.service.reportDelay(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/delay/publish')
  publish(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: PublishDelayDto, @CurrentUser() u: AuthUser) { return this.service.publishDelay(id, u, dto); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/delay/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RejectDelayDto, @CurrentUser() u: AuthUser) { return this.service.rejectDelay(id, u, dto.note); }
}
