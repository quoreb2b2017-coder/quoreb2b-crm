import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CSV_IMPORT_FAILED_ROW_COLLECTION } from '../csv-import.constants';

@Schema({ timestamps: true, collection: CSV_IMPORT_FAILED_ROW_COLLECTION })
export class CsvImportFailedRow extends Document {
  @Prop({ required: true, index: true })
  jobId: string;

  @Prop({ required: true })
  rowNumber: number;

  @Prop({ type: [String], default: [] })
  row: string[];

  @Prop({ required: true })
  error: string;
}

export const CsvImportFailedRowSchema = SchemaFactory.createForClass(CsvImportFailedRow);
CsvImportFailedRowSchema.index({ jobId: 1, rowNumber: 1 });
