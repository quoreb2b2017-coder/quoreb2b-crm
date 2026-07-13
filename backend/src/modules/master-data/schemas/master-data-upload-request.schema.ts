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

  /** pending = DB admin → admin; pending_db_admin | active | pending_admin = employee workflow */
  @Prop({ default: 'pending' })
  status: string;

  @Prop({ enum: ['db_admin', 'employee'], default: 'db_admin' })
  sourceRole: string;

  @Prop({ type: [[String]], default: [] })
  workRows: string[][];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  dbAdminReviewedBy?: Types.ObjectId;

  @Prop()
  dbAdminReviewedByEmail?: string;

  @Prop()
  dbAdminReviewedAt?: Date;

  @Prop()
  dbAdminReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  forwardedBy?: Types.ObjectId;

  @Prop()
  forwardedByEmail?: string;

  @Prop()
  forwardedAt?: Date;

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

  /** Total rows in the uploaded spreadsheet (before duplicate split). */
  @Prop()
  submittedRowCount?: number;

  @Prop()
  mergedAddedRows?: number;

  @Prop()
  mergedTotalRows?: number;
}

export const MasterDataUploadRequestSchema =
  SchemaFactory.createForClass(MasterDataUploadRequest);
MasterDataUploadRequestSchema.index({ status: 1, createdAt: -1 });
MasterDataUploadRequestSchema.index({ submittedBy: 1, createdAt: -1 });
MasterDataUploadRequestSchema.index({ sourceRole: 1, status: 1, createdAt: -1 });
MasterDataUploadRequestSchema.index({ submittedBy: 1, status: 1, createdAt: -1 });
MasterDataUploadRequestSchema.index({ status: 1, sourceRole: 1, createdAt: -1 });
