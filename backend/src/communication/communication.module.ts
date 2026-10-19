import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from '../jobs/jobs.module';
import { CommunicationListener } from './communication.listener';
import { EmailsController, EmailTemplatesController, NotificationSettingsController, NotificationsController } from './communication.controller';
import { EmailProviderFactory } from './email-providers';
import { EmailTemplatesService } from './email-templates.service';
import { EmailWorker } from './email.worker';
import { EmailsService } from './emails.service';
import { MailService } from './mail.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';
import { NotificationSetting, NotificationSettingSchema } from './schemas/notification-setting.schema';
import { ResendWebhookController } from './resend-webhook.controller';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { Email, EmailSchema } from './schemas/email.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';

@Global()
@Module({
  imports: [JobsModule, MongooseModule.forFeature([
    { name: Notification.name, schema: NotificationSchema }, { name: Email.name, schema: EmailSchema }, { name: EmailTemplate.name, schema: EmailTemplateSchema },
    { name: NotificationSetting.name, schema: NotificationSettingSchema },
  ])],
  controllers: [NotificationsController, EmailsController, EmailTemplatesController, NotificationSettingsController, ResendWebhookController],
  providers: [EmailTemplatesService, MailService, EmailProviderFactory, EmailWorker, EmailsService, NotificationsService, NotificationSettingsService, CommunicationListener],
  exports: [MailService, NotificationsService, EmailWorker, EmailTemplatesService, MongooseModule],
})
export class CommunicationModule {}
