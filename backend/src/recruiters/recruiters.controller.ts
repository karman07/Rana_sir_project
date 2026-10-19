import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role, UserStatus } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { BulkCreateRecruitersDto, CreateRecruiterDto, ListRecruitersQueryDto, RequiredReasonDto, ReviewDecisionDto } from './dto/recruiter.dto';
import { RecruitersService } from './recruiters.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

/** Admin-only management of recruiter (agent) accounts. */
@Controller('recruiters')
@Roles(Role.ADMIN)
export class RecruitersController {
  constructor(private readonly service: RecruitersService) {}

  @Get() list(@Query() q: ListRecruitersQueryDto) { return this.service.list(q); }
  @Get('counts') counts() { return this.service.counts(); }

  @Post() create(@Body() dto: CreateRecruiterDto, @CurrentUser() admin: AuthUser) { return this.service.createByAdmin(dto, admin); }
  @Post('bulk') createMany(@Body() dto: BulkCreateRecruitersDto, @CurrentUser() admin: AuthUser) { return this.service.createMany(dto.recruiters, admin); }

  @HttpCode(200) @Post(':id/approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReviewDecisionDto, @CurrentUser() admin: AuthUser) {
    return this.service.approve(id, admin, dto.note);
  }
  @HttpCode(200) @Post(':id/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RequiredReasonDto, @CurrentUser() admin: AuthUser) {
    return this.service.reject(id, admin, dto.note);
  }
  @HttpCode(200) @Post(':id/request-changes')
  requestChanges(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: RequiredReasonDto, @CurrentUser() admin: AuthUser) {
    return this.service.requestChanges(id, admin, dto.note);
  }
  @HttpCode(200) @Post(':id/resend-invite')
  resendInvite(@Param('id', ParseObjectIdPipe) id: string) { return this.service.resendInvite(id); }
  @HttpCode(200) @Post(':id/suspend')
  suspend(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) { return this.service.setUserStatus(id, UserStatus.SUSPENDED, admin); }
  @HttpCode(200) @Post(':id/reactivate')
  reactivate(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) { return this.service.setUserStatus(id, UserStatus.ACTIVE, admin); }
}
