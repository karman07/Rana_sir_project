import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Role, UserStatus } from '@rms/shared';
import type { HydratedDocument } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

@Schema({ timestamps: true })
export class User extends BaseEntity {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Absent for Google-only and not-yet-activated (invited) accounts. */
  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ type: String, required: true, enum: Object.values(Role), index: true })
  role: Role;

  @Prop({ type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ index: { unique: true, sparse: true } })
  googleId?: string;

  @Prop() avatarUrl?: string;
  @Prop() phone?: string;

  /** ISO 3166 country code; drives default display currency. */
  @Prop({ uppercase: true, maxlength: 2 }) country?: string;
  @Prop() currency?: string;
  @Prop() timezone?: string;

  @Prop() lastLoginAt?: Date;
  /** Admin who created the account, when created from the admin panel. */
  @Prop() createdBy?: string;

  /** Managed by `timestamps`; declared so queries, aggregations and seeds can use it. */
  createdAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
