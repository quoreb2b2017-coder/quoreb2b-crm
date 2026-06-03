import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BatchStatus } from '../bulk-email-verification.constants';

@Schema({
  timestamps: true,
  collection: 'email_verification_batches',
})
export class EmailVerificationBatch extends Document {
  @Prop({ required: true, trim: true })
  sourceFileName!: string;

  @Prop({
    type: String,
    enum: Object.values(BatchStatus),
    default: BatchStatus.PENDING,
    index: true,
  })
  status!: BatchStatus;

  @Prop({ type: Number, default: 0 })
  totalProspects!: number;

  @Prop({ type: Number, default: 0 })
  processedProspects!: number;

  @Prop({ type: Number, default: 0 })
  emailsGenerated!: number;

  @Prop({ type: Number, default: 0 })
  verifiedCount!: number;

  @Prop({ type: Number, default: 0 })
  invalidCount!: number;

  @Prop({ type: Number, default: 0 })
  catchAllCount!: number;

  @Prop({ type: Number, default: 0 })
  riskyCount!: number;

  @Prop({ type: Number, default: 0 })
  likelyValidCount!: number;

  @Prop({ type: Number, default: 0 })
  unknownCount!: number;

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId;

  @Prop({ trim: true })
  createdByEmail?: string;

  @Prop({ trim: true })
  errorMessage?: string;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const EmailVerificationBatchSchema =
  SchemaFactory.createForClass(EmailVerificationBatch);

EmailVerificationBatchSchema.index({ createdBy: 1, createdAt: -1 });
EmailVerificationBatchSchema.index({ status: 1, createdAt: -1 });
