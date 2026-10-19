import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** A message from the public contact form. */
@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, lowercase: true, trim: true }) email: string;
  @Prop({ trim: true }) company?: string;
  @Prop({ type: String, enum: ['HIRING', 'CANDIDATE', 'GENERAL'], default: 'GENERAL' }) topic: 'HIRING' | 'CANDIDATE' | 'GENERAL';
  @Prop({ required: true }) message: string;
  @Prop({ type: String, enum: ['NEW', 'READ'], default: 'NEW', index: true }) status: 'NEW' | 'READ';
  @Prop() ip?: string;
  createdAt: Date;
}
export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ createdAt: -1 });
