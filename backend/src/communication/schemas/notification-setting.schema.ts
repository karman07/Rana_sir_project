import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** Admin's switch for one kind of event: whether people are told in the app, by email, both or neither. Absent means both on. */
@Schema({ timestamps: true, collection: 'notificationsettings' })
export class NotificationSetting {
  @Prop({ required: true, unique: true }) event: string;
  @Prop({ default: true }) inApp: boolean;
  @Prop({ default: true }) email: boolean;
  @Prop() updatedBy?: string;
}
export type NotificationSettingDocument = HydratedDocument<NotificationSetting>;
export const NotificationSettingSchema = SchemaFactory.createForClass(NotificationSetting);
