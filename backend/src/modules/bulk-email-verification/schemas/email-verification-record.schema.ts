import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EmailVerificationStatus } from '../bulk-email-verification.constants';

@Schema({
  timestamps: true,
  collection: 'email_verification_records',
})
export class EmailVerificationRecord extends Document {
  @Prop({ type: Types.ObjectId, ref: 'EmailVerificationBatch', required: true, index: true })
  batchId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ trim: true, default: '' })
  companyName!: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  domain!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  generatedEmail!: string;

  @Prop({ trim: true })
  patternType?: string;

  @Prop({
    type: String,
    enum: Object.values(EmailVerificationStatus),
    default: EmailVerificationStatus.UNKNOWN,
    index: true,
  })
  verificationStatus!: EmailVerificationStatus;

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  confidenceScore!: number;

  @Prop({ trim: true, default: 'Unknown' })
  confidenceLabel?: string;

  @Prop({ default: false })
  syntaxValid?: boolean;

  @Prop({ default: false })
  domainExists?: boolean;

  @Prop({ default: false })
  mxValid!: boolean;

  @Prop({ default: false })
  isDisposable?: boolean;

  @Prop({ default: false })
  isRoleBased?: boolean;

  @Prop({ default: false })
  isCatchAllDomain?: boolean;

  @Prop({ trim: true })
  smtpResponse?: string;

  @Prop({ trim: true, lowercase: true })
  correctedEmail?: string;

  @Prop({ trim: true })
  recommendedEmail?: string;

  @Prop({ trim: true })
  zerobounceStatus?: string;

  @Prop({ trim: true })
  zerobounceSubStatus?: string;

  @Prop({ trim: true, default: 'internal' })
  verificationProvider?: string;

  @Prop({ type: Date })
  verificationDate?: Date;

  @Prop({ required: true, trim: true })
  sourceFile!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId;
}

export const EmailVerificationRecordSchema =
  SchemaFactory.createForClass(EmailVerificationRecord);

EmailVerificationRecordSchema.index(
  { batchId: 1, generatedEmail: 1 },
  { unique: true },
);
EmailVerificationRecordSchema.index({ batchId: 1, verificationStatus: 1 });
EmailVerificationRecordSchema.index({ batchId: 1, confidenceScore: -1 });
EmailVerificationRecordSchema.index({ createdBy: 1, createdAt: -1 });
EmailVerificationRecordSchema.index({ domain: 1, verificationDate: -1 });
