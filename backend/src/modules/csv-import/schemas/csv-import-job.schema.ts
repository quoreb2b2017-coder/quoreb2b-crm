import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CSV_IMPORT_JOB_COLLECTION } from '../csv-import.constants';

export type CsvImportJobStatus =
  | 'pending_upload'
  | 'queued'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

@Schema({ _id: false })
export class CsvImportCheckpoint {
  @Prop({ default: 0 })
  lastRowNumber: number;

  @Prop({ default: 0 })
  nextChunkIndex: number;

  @Prop({ default: 0 })
  successRows: number;

  @Prop({ default: 0 })
  failedRows: number;
}

export const CsvImportCheckpointSchema = SchemaFactory.createForClass(CsvImportCheckpoint);

@Schema({ _id: false })
export class CsvImportProgress {
  @Prop({ default: 0 })
  processed: number;

  @Prop({ default: 0 })
  success: number;

  @Prop({ default: 0 })
  failed: number;

  @Prop({ default: 0 })
  totalEstimate: number;

  @Prop({ default: 0 })
  percent: number;

  @Prop({ default: '' })
  message: string;
}

export const CsvImportProgressSchema = SchemaFactory.createForClass(CsvImportProgress);

@Schema({ timestamps: true, collection: CSV_IMPORT_JOB_COLLECTION })
export class CsvImportJob extends Document {
  @Prop({ required: true, unique: true, index: true })
  jobId: string;

  @Prop({ required: true, default: 'master-data' })
  target: string;

  @Prop({ required: true, default: 'master' })
  masterKey: string;

  @Prop({ required: true, enum: ['replace', 'append'] })
  mode: 'replace' | 'append';

  @Prop({
    required: true,
    enum: [
      'pending_upload',
      'queued',
      'processing',
      'paused',
      'completed',
      'failed',
      'cancelled',
    ],
    default: 'pending_upload',
    index: true,
  })
  status: CsvImportJobStatus;

  @Prop({ required: true })
  fileName: string;

  @Prop({ default: 0 })
  fileSizeBytes: number;

  @Prop({ default: '' })
  contentHash: string;

  @Prop({ default: '' })
  s3Bucket: string;

  @Prop({ required: true })
  s3Key: string;

  /** EC2 disk path while multipart upload is transferred to S3 (fallback flow). */
  @Prop({ default: '' })
  stagingLocalPath: string;

  @Prop({ default: '' })
  errorCsvS3Key: string;

  @Prop({ type: [String], default: [] })
  headers: string[];

  @Prop({ type: CsvImportProgressSchema, default: () => ({}) })
  progress: CsvImportProgress;

  @Prop({ type: CsvImportCheckpointSchema, default: () => ({}) })
  checkpoint: CsvImportCheckpoint;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop({ default: '' })
  uploadedByEmail: string;

  /** super_admin | admin | db_admin — drives duplicate/missing folder routing. */
  @Prop({ default: 'db_admin' })
  uploadSourceRole: string;

  @Prop({ default: false })
  pauseRequested: boolean;

  @Prop({ default: false })
  cancelRequested: boolean;

  @Prop({ default: '' })
  errorMessage: string;

  @Prop({ default: '' })
  duplicateOfJobId: string;

  /** Temp duplicates folder (upload_request id) for append imports. */
  @Prop({ default: '' })
  duplicateHoldRequestId: string;

  @Prop({ default: 0 })
  duplicateRowsHeld: number;

  /** Rows skipped for missing critical fields (saved to Missing Data). */
  @Prop({ default: 0 })
  incompleteRowsHeld: number;

  /** Upload receipt (master_data_upload_requests) created on complete */
  @Prop({ default: '' })
  uploadReceiptId: string;

  /** Duplicate companion file id */
  @Prop({ default: '' })
  duplicateFileId: string;

  @Prop({ default: 1000 })
  batchSize: number;

  @Prop({ default: 0 })
  bullJobId: string;

  @Prop({ default: 0 })
  totalBatches: number;

  @Prop({ default: 0 })
  completedBatches: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const CsvImportJobSchema = SchemaFactory.createForClass(CsvImportJob);
CsvImportJobSchema.index({ status: 1, updatedAt: -1 });
CsvImportJobSchema.index({ contentHash: 1, masterKey: 1, status: 1 });
CsvImportJobSchema.index({ uploadedBy: 1, createdAt: -1 });
