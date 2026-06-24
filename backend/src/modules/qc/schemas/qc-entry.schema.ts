import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QcCampaignChannel, QcEntryState, QcDecision } from '../qc.constants';

@Schema({ timestamps: true })
export class QcEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true, index: true })
  batchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch', index: true })
  rootBatchId?: Types.ObjectId;

  @Prop({ required: true })
  campaignName: string;

  @Prop({ required: true, enum: ['voip', 'gps', 'email', 'other'], index: true })
  campaignChannel: QcCampaignChannel;

  @Prop({ min: 1, max: 12, index: true })
  batchMonth?: number;

  @Prop({ index: true })
  batchYear?: number;

  @Prop({ required: true, min: 0 })
  rowIndex: number;

  @Prop({ required: true })
  leadKey: string;

  @Prop()
  leadLabel?: string;

  @Prop()
  statusValue?: string;

  @Prop({ type: [String], default: [] })
  headers: string[];

  @Prop({ type: [String], default: [] })
  rowData: string[];

  @Prop({ type: [String], default: [] })
  previousRowData: string[];

  @Prop({ type: [String], default: [] })
  changedColumns: string[];

  @Prop({ default: 'pending', enum: ['pending', 'merged', 'rejected'], index: true })
  state: QcEntryState;

  @Prop({ enum: ['qualified', 'tbd', 'disqualified'], index: true })
  qcDecision?: QcDecision;

  /** TBD / Disqualified — visible on employee My QC */
  @Prop({ default: false, index: true })
  returnedToEmployee?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  mergedReadyBatchId?: Types.ObjectId;
}

export const QcEntrySchema = SchemaFactory.createForClass(QcEntry);
QcEntrySchema.index({ employeeId: 1, state: 1, batchYear: -1, batchMonth: -1 });
QcEntrySchema.index({ campaignChannel: 1, state: 1, batchYear: -1, batchMonth: -1 });
QcEntrySchema.index({ batchId: 1, rowIndex: 1, employeeId: 1, state: 1 });
