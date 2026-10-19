import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApplicationStatus, Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ReasonDto, RecruiterApproveDto, RequestMoreCandidatesDto, ScreenDto, SendToRecruiterDto, ShortlistDto } from './dto/screening.dto';
import { RecruiterReviewService } from './recruiter-review.service';
import { ScreeningService } from './screening.service';

/** Admin screening workspace. */
@Controller()
@Roles(Role.ADMIN)
export class ScreeningController {
  constructor(private readonly service: ScreeningService) {}

  @Get('screening/queue') queue() { return this.service.queue(); }

  @Get('screening/jobs/:jobId')
  ranking(@Param('jobId', ParseObjectIdPipe) jobId: string, @Query('statuses') statuses?: string) {
    const list = statuses ? (statuses.split(',') as ApplicationStatus[]) : undefined;
    if (list?.some((s) => !Object.values(ApplicationStatus).includes(s))) throw new BadRequestException('Unknown status');
    return this.service.ranking(jobId, { status: list });
  }

  @Get('screening/compare')
  compare(@Query('ids') ids = '') {
    const list = ids.split(',').filter(Boolean);
    if (list.some((i) => !/^[a-f\d]{24}$/i.test(i))) throw new BadRequestException('Invalid id');
    return this.service.compare(list);
  }

  @Get('screening/:applicationId/match')
  match(@Param('applicationId', ParseObjectIdPipe) id: string) { return this.service.matchFor1(id); }

  @HttpCode(200) @Post('screening/send-to-recruiter')
  sendMany(@Body() dto: SendToRecruiterDto, @CurrentUser() u: AuthUser) { return this.service.sendToRecruiter(dto.applicationIds, u, dto.notes); }

  @HttpCode(200) @Post('applications/:id/send-to-recruiter')
  sendOne(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ShortlistDto, @CurrentUser() u: AuthUser) {
    return this.service.sendToRecruiter([id], u, dto.notes).then((r) => {
      if (r.failed) throw new BadRequestException(r.results[0].error);
      return r.results[0];
    });
  }

  @HttpCode(200) @Post('screening/:applicationId')
  screen(@Param('applicationId', ParseObjectIdPipe) id: string, @Body() dto: ScreenDto, @CurrentUser() u: AuthUser) { return this.service.screen(id, dto, u); }

  @HttpCode(200) @Post('screening/:applicationId/shortlist')
  shortlist(@Param('applicationId', ParseObjectIdPipe) id: string, @Body() dto: ShortlistDto, @CurrentUser() u: AuthUser) { return this.service.shortlist(id, u, dto.notes); }

  @HttpCode(200) @Post('screening/:applicationId/reject')
  reject(@Param('applicationId', ParseObjectIdPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.reject(id, u, dto.reason); }
}

/** Recruiter decisions on candidates Admin has sent them. */
@Controller()
@Roles(Role.RECRUITER)
@RequireApprovedRecruiter()
export class RecruiterReviewController {
  constructor(private readonly service: RecruiterReviewService) {}

  @HttpCode(200) @Post('applications/:id/recruiter-approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecruiterApproveDto, @CurrentUser() u: AuthUser) { return this.service.approve(id, dto, u); }

  @HttpCode(200) @Post('applications/:id/recruiter-reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.reject(id, dto.reason, u); }

  @HttpCode(200) @Post('applications/:id/request-changes')
  requestChanges(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) { return this.service.requestChanges(id, dto.reason, u); }

  @Post('jobs/:id/request-more-candidates')
  requestMore(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RequestMoreCandidatesDto, @CurrentUser() u: AuthUser) { return this.service.requestMore(id, dto, u); }

  @Get('candidate-requests/mine') mine(@CurrentUser() u: AuthUser) { return this.service.mineRequests(u); }
}
