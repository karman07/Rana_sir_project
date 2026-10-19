import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'emailtemplates' })
export class EmailTemplate {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true }) subject: string;
  /** Heading shown at the top of the branded layout. */
  @Prop({ required: true }) heading: string;
  /** HTML fragment with {{variables}}. The branded layout wraps it. */
  @Prop({ required: true }) body: string;
  @Prop() ctaLabel?: string;
  @Prop({ type: [String], default: [] }) variables: string[];
  @Prop({ default: true }) enabled: boolean;
  /** Bodies contain one-time links, so they are scrubbed after sending. */
  @Prop({ default: false }) sensitive: boolean;
  @Prop() updatedBy?: string;
  /** False once an admin edits it; defaults never overwrite edited templates. */
  @Prop({ default: false }) customised: boolean;
}

export type EmailTemplateDocument = HydratedDocument<EmailTemplate>;
export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
