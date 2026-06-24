import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const SUPPRESSION_DATA_KEY = 'suppression_upload';
/** @deprecated legacy key — still read for migration */
export const DELIVERED_DATA_KEY = 'delivered_upload';

@Schema({ timestamps: true, collection: 'suppression_data' })
export class SuppressionDataRecord extends Document {
  @Prop({ required: true, unique: true, default: SUPPRESSION_DATA_KEY })
  key: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  sheetName: string;

  @Prop({ type: [String], required: true })
  headers: string[];

  @Prop({ type: [[String]], required: true, default: [] })
  rows: string[][];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadedByEmail?: string;
}

export const SuppressionDataSchema = SchemaFactory.createForClass(SuppressionDataRecord);
SuppressionDataSchema.index({ updatedAt: -1 });

/** @deprecated use SuppressionDataRecord */
export const DeliveredDataRecord = SuppressionDataRecord;
export const DeliveredDataSchema = SuppressionDataSchema;
