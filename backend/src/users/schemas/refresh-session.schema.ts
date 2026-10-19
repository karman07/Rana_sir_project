import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

/** One row per issued refresh token. Rotation keeps a `family`; replaying a used token revokes the family. */
@Schema({ timestamps: true })
export class RefreshSession {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true, index: true })
  family: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop() revokedAt?: Date;
  @Prop() userAgent?: string;
  @Prop() ip?: string;
}

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;
export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);
// Mongo removes expired sessions automatically.
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
