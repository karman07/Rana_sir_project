import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const RuleScope = { GLOBAL: 'GLOBAL', RECRUITER: 'RECRUITER', JOB: 'JOB' } as const;
export type RuleScope = (typeof RuleScope)[keyof typeof RuleScope];

/**
 * What the platform keeps from each payment. The most specific active rule wins: job, then recruiter, then the global one.
 * A rule applies to contracts created after it; existing contracts keep the commission they were agreed with.
 */
@Schema({ timestamps: true, collection: 'commissionrules' })
export class CommissionRuleDoc {
  @Prop({ type: String, enum: Object.values(RuleScope), required: true, index: true }) scope: RuleScope;
  /** The recruiter's user id or the job id; empty for the global rule. */
  @Prop({ type: 'ObjectId', index: true }) refId?: Types.ObjectId;
  /** Shown to Admin so a rule is recognisable later ("Priya Nair", "JOB-1004 · Data Analyst"). */
  @Prop() refLabel?: string;
  @Prop({ type: String, enum: ['PERCENT', 'FIXED'], required: true }) type: 'PERCENT' | 'FIXED';
  @Prop() basisPoints?: number;
  /** Minor units; only for FIXED. */
  @Prop() amount?: number;
  @Prop() currency?: string;
  @Prop({ default: true, index: true }) active: boolean;
  @Prop({ trim: true }) note?: string;
  @Prop({ type: 'ObjectId' }) createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export type CommissionRuleDocument = HydratedDocument<CommissionRuleDoc>;
export const CommissionRuleSchema = SchemaFactory.createForClass(CommissionRuleDoc);
CommissionRuleSchema.index({ scope: 1, refId: 1, active: 1 });
