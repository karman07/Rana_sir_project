import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { Roles } from '../auth/decorators';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit-logs')
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get() list(@Query() q: AuditQueryDto) { return this.service.list(q); }
  @Get('actions') actions() { return this.service.actions(); }
}
