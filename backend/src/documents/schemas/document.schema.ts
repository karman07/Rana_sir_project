import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../common/database/base.schema';

export const DocumentType = {
  RESUME: 'RESUME', COVER_LETTER: 'COVER_LETTER', IDENTIFICATION: 'IDENTIFICATION', CERTIFICATE: 'CERTIFICATE',
  OFFER_LETTER: 'OFFER_LETTER', CONTRACT: 'CONTRACT', PAYSLIP: 'PAYSLIP', PAYMENT_PROOF: 'PAYMENT_PROOF', INTERVIEW: 'INTERVIEW', OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/**
 * Metadata for a privately stored file. The bytes live on disk under a random key and are only ever
 * served through an authorised download; `storageKey` is never returned to clients.
 */
@Schema({ timestamps: true, collection: 'documents' })
export class DocumentFile extends BaseEntity {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true }) ownerId: Types.ObjectId;
  @Prop({ type: String, enum: Object.values(DocumentType), required: true }) type: DocumentType;
  /** What the owner calls it, e.g. "Passport copy". */
  @Prop({ trim: true }) label?: string;
  /** Versions of the same logical document (a resume) share a group; older ones are ARCHIVED, never deleted. */
  @Prop({ index: true }) groupKey?: string;
  @Prop({ default: 1 }) version: number;
  @Prop({ type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' }) status: 'ACTIVE' | 'ARCHIVED';
  @Prop(raw({ type: { type: String }, id: { type: String } })) related?: { type: string; id: string };

  @Prop({ required: true }) originalName: string;
  @Prop({ required: true }) mime: string;
  @Prop({ required: true }) size: number;
  @Prop({ required: true, select: false }) storageKey: string;
  createdAt: Date;
}

export type DocumentFileDocument = HydratedDocument<DocumentFile>;
export const DocumentFileSchema = SchemaFactory.createForClass(DocumentFile);
DocumentFileSchema.index({ ownerId: 1, type: 1, status: 1 });
