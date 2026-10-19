import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CommissionRulesService } from './commission-rules.service';
import { CreateCommissionRuleDto, ResolveRuleQueryDto } from './dto/commission-rule.dto';

/** How the platform earns is Admin-only, so everything here is too. */
@Controller('commission-rules')
@Roles(Role.ADMIN)
export class CommissionRulesController {
  constructor(private readonly service: CommissionRulesService) {}

  @Get() list() { return this.service.list(); }

  /** What a contract for this recruiter / job would start with, and why. */
  @Get('resolve')
  async resolve(@Query() q: ResolveRuleQueryDto) {
    const { rule, source } = await this.service.resolve(q);
    return { rule, source };
  }

  @Post() create(@Body() dto: CreateCommissionRuleDto, @CurrentUser() u: AuthUser) { return this.service.create(dto, u); }

  @HttpCode(200) @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.deactivate(id, u); }
}
