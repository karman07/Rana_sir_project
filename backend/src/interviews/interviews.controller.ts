import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CancelDto, CreateInterviewDto, FeedbackDto, ListInterviewsQueryDto, UpdateInterviewDto } from './dto/interview.dto';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly service: InterviewsService) {}

  /** Candidates: their own interviews. Recruiters: their candidates'. Admin: all. */
  @Get() list(@Query() q: ListInterviewsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.service.summary(u); }
  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @Post()
  schedule(@Body() dto: CreateInterviewDto, @CurrentUser() u: AuthUser) { return this.service.schedule(dto, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateInterviewDto, @CurrentUser() u: AuthUser) { return this.service.update(id, dto, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/cancel')
  cancel(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CancelDto, @CurrentUser() u: AuthUser) { return this.service.cancel(id, dto.reason, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/complete')
  complete(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.complete(id, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/no-show')
  noShow(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.noShow(id, u); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/feedback')
  feedback(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: FeedbackDto, @CurrentUser() u: AuthUser) { return this.service.submitFeedback(id, dto, u); }
}
