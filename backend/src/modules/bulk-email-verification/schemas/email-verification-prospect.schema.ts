import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'email_verification_prospects',
})
export class EmailVerificationProspect extends Document {
  @Prop({ type: Types.ObjectId, ref: 'EmailVerificationBatch', required: true, index: true })
  batchId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ trim: true, default: '' })
  companyName!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  domain!: string;

  /** When upload includes Email column — verify this address first. */
  @Prop({ trim: true, lowercase: true })
  providedEmail?: string;

  @Prop({ default: false, index: true })
  processed!: boolean;
}

export const EmailVerificationProspectSchema =
  SchemaFactory.createForClass(EmailVerificationProspect);

EmailVerificationProspectSchema.index({ batchId: 1, processed: 1 });
EmailVerificationProspectSchema.index(
  { batchId: 1, firstName: 1, lastName: 1, domain: 1 },
  { unique: true },
);
