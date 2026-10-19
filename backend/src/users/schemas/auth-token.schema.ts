import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const AuthTokenPurpose = {
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  RESET_PASSWORD: 'RESET_PASSWORD',
  INVITE: 'INVITE',
} as const;
export type AuthTokenPurpose = (typeof AuthTokenPurpose)[keyof typeof AuthTokenPurpose];

@Schema({ timestamps: true })
export class AuthToken {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(AuthTokenPurpose) })
  purpose: AuthTokenPurpose;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop() usedAt?: Date;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;
export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
