import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'master_data_upload_requests' })
export class MasterDataUploadRequest extends Document {
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  sheetName: string;

  @Prop({ type: [String], required: true })
  headers: string[];

  @Prop({ type: [[String]], required: true, default: [] })
  rows: string[][];

  @Prop({ required: true, default: 0 })
  rowCount: number;

  @Prop({ required: true, default: 0 })
  duplicateCount: number;

  @Prop({ type: [[String]], default: [] })
  duplicatePreviewRows: string[][];

  @Prop({ required: true, default: 0 })
  missingValueCount: number;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedBy: Types.ObjectId;

  @Prop()
  submittedByEmail?: string;

  @Prop()
  reason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedByEmail?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  mergedAddedRows?: number;

  @Prop()
  mergedTotalRows?: number;
}

export const MasterDataUploadRequestSchema =
  SchemaFactory.createForClass(MasterDataUploadRequest);
MasterDataUploadRequestSchema.index({ status: 1, createdAt: -1 });
MasterDataUploadRequestSchema.index({ submittedBy: 1, createdAt: -1 });
