import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type {
  MissingDataSourceRole,
  MissingDataSourceType,
} from '../missing-data.constants';

@Schema({ timestamps: true, collection: 'missing_data_files' })
export class MissingDataFile extends Document {
  /** Idempotent key e.g. upload_request:<id> or master_backfill:2026-7 */
  @Prop({ required: true, unique: true, index: true })
  sourceKey: string;

  @Prop({ required: true })
  sourceType: MissingDataSourceType;

  @Prop()
  sourceRequestId?: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ default: 'Missing Data' })
  sheetName: string;

  @Prop({ type: [String], default: [] })
  headers: string[];

  @Prop({ type: [[String]], default: [] })
  rows: string[][];

  @Prop({ required: true, min: 0, default: 0 })
  rowCount: number;

  /** Union of missing critical fields across rows */
  @Prop({ type: [String], default: [] })
  missingFields: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  uploadedBy: Types.ObjectId;

  @Prop()
  uploadedByEmail?: string;

  @Prop()
  uploadedByName?: string;

  @Prop({
    required: true,
    enum: ['employee', 'db_admin', 'master', 'admin', 'super_admin'],
    index: true,
  })
  sourceRole: MissingDataSourceRole;

  @Prop({ required: true, min: 1, max: 12, index: true })
  batchMonth: number;

  @Prop({ required: true, index: true })
  batchYear: number;
}

export const MissingDataFileSchema = SchemaFactory.createForClass(MissingDataFile);
MissingDataFileSchema.index({ batchYear: -1, batchMonth: -1, createdAt: -1 });
MissingDataFileSchema.index({ uploadedBy: 1, batchYear: -1, batchMonth: -1 });
MissingDataFileSchema.index({ sourceRole: 1, batchYear: -1, batchMonth: -1 });
