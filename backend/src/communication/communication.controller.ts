import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EmailsService } from './emails.service';
import { MailService } from './mail.service';
import { NotificationSettingsService } from './notification-settings.service';
import { EmailTemplatesService } from './email-templates.service';
import { NotificationsService } from './notifications.service';
import { EmailStatus } from './schemas/email.schema';
import { NotificationType } from '@rms/shared';

class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unread?: boolean;
  @IsOptional() @IsIn(Object.values(NotificationType)) type?: string;
}

/** Every signed-in user has their own notification centre. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(@Query() q: NotificationQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('unread-count') unread(@CurrentUser() u: AuthUser) { return this.service.unreadCount(u); }
  @HttpCode(200) @Post('read-all') readAll(@CurrentUser() u: AuthUser) { return this.service.markAllRead(u); }
  @Patch(':id/read') read(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.markRead(id, u); }
}

class EmailQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn([...Object.values(EmailStatus), 'SCHEDULED']) status?: string;
  @IsOptional() @IsString() @MaxLength(60) template?: string;
}

@Controller('emails')
@Roles(Role.ADMIN)
export class EmailsController {
  constructor(private readonly service: EmailsService, private readonly config: ConfigService<Env, true>) {}
  @Get() list(@Query() q: EmailQueryDto) { return this.service.list(q); }
  @Get('stats') stats() { return this.service.stats(); }

  /** How email is set up, without ever revealing a key. */
  @Get('status')
  status() {
    const from = this.config.get('EMAIL_FROM') as string;
    const key = this.config.get('RESEND_API_KEY') as string | undefined;
    return {
      provider: key ? 'resend' : 'console', live: !!key, from, fromAddress: /<([^>]+)>/.exec(from)?.[1] ?? from,
      worker: this.config.get('EMAIL_WORKER') === 'off' ? 'off' : 'on', webhookSigned: !!this.config.get('RESEND_WEBHOOK_SECRET'), webOrigin: this.config.get('WEB_ORIGIN'),
    };
  }
  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string) { return this.service.get(id); }
  @HttpCode(200) @Post(':id/retry') retry(@Param('id', ParseObjectIdPipe) id: string) { return this.service.retry(id); }
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
class PreviewDto {
  @IsOptional() @IsObject() vars?: Record<string, string>;
  /** An unsaved draft to render instead of the saved wording. */
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
}
class UpdateSettingDto {
  @IsOptional() @IsBoolean() inApp?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

@Controller('email-templates')
@Roles(Role.ADMIN)
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService, private readonly mail: MailService) {}
  @Get() list() { return this.service.list(); }
  @Patch(':key') update(@Param('key') key: string, @Body() dto: UpdateTemplateDto, @CurrentUser() u: AuthUser) { return this.service.update(key, dto, u.id); }
  @HttpCode(200) @Post(':key/reset') reset(@Param('key') key: string) { return this.service.reset(key); }

  /** Sends the saved template, filled with sample values, to the Admin who asked. */
  @HttpCode(200) @Post(':key/test')
  async test(@Param('key') key: string, @CurrentUser() u: AuthUser) {
    const tpl = (await this.service.list()).find((t: any) => t.key === key);
    if (!tpl) throw new NotFoundException('Template not found');
    const id = await this.mail.send({ to: u.email, toName: u.name, userId: u.id, template: key, vars: this.service.samples(key, tpl.variables), related: { type: 'EmailTemplate', id: key }, ignoreEnabled: true });
    return { sent: !!id, to: u.email };
  }

  @HttpCode(200) @Post(':key/preview') preview(@Param('key') key: string, @Body() dto: PreviewDto) { return this.service.preview(key, dto.vars ?? {}, { subject: dto.subject, heading: dto.heading, body: dto.body, ctaLabel: dto.ctaLabel }); }
}

/** Admin's control over which events notify people, in the app and by email. */
@Controller('notification-settings')
@Roles(Role.ADMIN)
export class NotificationSettingsController {
  constructor(private readonly service: NotificationSettingsService) {}
  @Get() list() { return this.service.list(); }
  @Patch(':event') update(@Param('event') event: string, @Body() dto: UpdateSettingDto, @CurrentUser() u: AuthUser) { return this.service.update(event, dto, u.id); }
}
