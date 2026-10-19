import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { NotificationType } from '@rms/shared';
import type { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' })
export class Notification {
  @Prop({ type: 'ObjectId', ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop({ type: String, enum: Object.values(NotificationType), default: NotificationType.SYSTEM }) type: NotificationType;
  @Prop() entityType?: string;
  @Prop() entityId?: string;
  /** In-app path the notification opens, already specific to the recipient's role. */
  @Prop() link?: string;
  @Prop({ default: false }) read: boolean;
  @Prop() readAt?: Date;
  /** The domain event that produced it, for traceability. */
  @Prop() event?: string;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
// Old notifications age out after a year.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });
