import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@rms/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { UpdateSettingsDto } from './dto/settings.dto';
import { PERMISSION_MATRIX } from './permissions-matrix';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  /** Safe values any signed-in person's forms can use (default currency, upload limit). */
  @Get('defaults') defaults() { return this.service.defaults(); }

  @Roles(Role.ADMIN) @Get() get() { return this.service.get(); }
  @Roles(Role.ADMIN) @Patch() update(@Body() dto: UpdateSettingsDto, @CurrentUser() u: AuthUser) { return this.service.update(dto, u); }

  /** Who can do what, in words. */
  @Roles(Role.ADMIN) @Get('permissions') permissions() { return { groups: PERMISSION_MATRIX }; }
}
