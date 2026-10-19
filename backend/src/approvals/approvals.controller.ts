import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { ApprovalAction } from './approval.types';
import { ApprovalActionDto, ApprovalsQueryDto } from './approvals.dto';
import { ApprovalsService } from './approvals.service';
import { BadRequestException } from '@nestjs/common';

const ACTIONS: ApprovalAction[] = ['approve', 'reject', 'request-changes'];

@Controller('approvals')
@Roles(Role.ADMIN)
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get() list(@Query() q: ApprovalsQueryDto) { return this.service.list(q); }
  @Get('summary') summary() { return this.service.summary(); }

  @HttpCode(200) @Post(':category/:id/:action')
  act(
    @Param('category') category: string, @Param('id', ParseObjectIdPipe) id: string, @Param('action') action: string,
    @Body() body: ApprovalActionDto, @CurrentUser() admin: AuthUser,
  ) {
    if (!ACTIONS.includes(action as ApprovalAction)) throw new BadRequestException('Unknown action');
    return this.service.act(category, id, action as ApprovalAction, admin, body);
  }
}
