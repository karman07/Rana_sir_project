import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { GeneratePayslipDto, ListPayslipsQueryDto } from './dto/payslip.dto';
import { PayslipsService } from './payslips.service';

/** Admin sees every payslip; a candidate sees their own. Recruiters have no access, since a payslip shows the candidate's pay. */
@Controller('payslips')
@Roles(Role.ADMIN, Role.CANDIDATE)
export class PayslipsController {
  constructor(private readonly service: PayslipsService) {}

  @Get() list(@Query() q: ListPayslipsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }

  @Roles(Role.ADMIN) @Get('missing') missing() { return this.service.missing(); }

  /** Issues a payslip that was missed. Payslips are never re-issued or edited. */
  @Roles(Role.ADMIN) @HttpCode(201) @Post('generate')
  generate(@Body() dto: GeneratePayslipDto, @CurrentUser() u: AuthUser) { return this.service.generateForPayment(dto.paymentId, u); }

  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }
}
