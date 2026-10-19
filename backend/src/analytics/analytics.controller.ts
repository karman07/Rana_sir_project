import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { PERIODS } from './periods';
import { ReportsService } from './reports.service';

class ReportQueryDto {
  @IsOptional() @IsIn([...PERIODS]) period?: string;
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService, private readonly reports: ReportsService) {}

  @Roles(Role.ADMIN) @Get('admin/overview')
  admin() { return this.service.admin(); }

  @Roles(Role.RECRUITER) @Get('recruiter/overview')
  recruiter(@CurrentUser() user: AuthUser) { return this.service.recruiter(user.id); }

  @Roles(Role.CANDIDATE) @Get('candidate/overview')
  candidate(@CurrentUser() user: AuthUser) { return this.service.candidate(user.id); }

  /* Period reports. Each role gets its own, and only the figures it may see. */
  @Roles(Role.ADMIN) @Get('admin/recruitment') adminRecruitment(@Query() q: ReportQueryDto) { return this.reports.adminRecruitment(q.period); }
  @Roles(Role.ADMIN) @Get('admin/financial') adminFinancial(@Query() q: ReportQueryDto) { return this.reports.adminFinancial(q.period, q.currency); }
  @Roles(Role.ADMIN) @Get('admin/recruiters') adminRecruiters(@Query() q: ReportQueryDto) { return this.reports.adminRecruiters(q.period); }
  @Roles(Role.ADMIN) @Get('admin/candidates') adminCandidates(@Query() q: ReportQueryDto) { return this.reports.adminCandidates(q.period); }
  @Roles(Role.RECRUITER) @Get('recruiter/report') recruiterReport(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.reports.recruiter(u.id, q.period); }
  @Roles(Role.CANDIDATE) @Get('candidate/report') candidateReport(@Query() q: ReportQueryDto, @CurrentUser() u: AuthUser) { return this.reports.candidate(u.id, q.period); }
}
