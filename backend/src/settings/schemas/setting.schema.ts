import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** One document of platform-wide settings, kept apart from the website content. Missing values fall back to the defaults in code. */
@Schema({ timestamps: true, collection: 'platformsettings' })
export class PlatformSetting {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ type: Object, default: {} }) data: Record<string, unknown>;
  @Prop() updatedBy?: string;
}
export type PlatformSettingDocument = HydratedDocument<PlatformSetting>;
export const PlatformSettingSchema = SchemaFactory.createForClass(PlatformSetting);
