import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QcCampaignChannel, QcEntryState, QcDecision } from '../qc.constants';

@Schema({ timestamps: true })
export class QcEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  employeeId: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  rootBatchId?: Types.ObjectId;

  @Prop({ required: true })
  campaignName: string;

  @Prop({ required: true, enum: ['voip', 'gps', 'email', 'other'] })
  campaignChannel: QcCampaignChannel;

  @Prop({ min: 1, max: 12 })
  batchMonth?: number;

  @Prop()
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

  @Prop({ default: 'pending', enum: ['pending', 'merged', 'rejected'] })
  state: QcEntryState;

  @Prop({ enum: ['qualified', 'tbd', 'disqualified'] })
  qcDecision?: QcDecision;

  /** TBD / Disqualified — visible on employee My QC */
  @Prop({ default: false })
  returnedToEmployee?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  mergedReadyBatchId?: Types.ObjectId;
}

export const QcEntrySchema = SchemaFactory.createForClass(QcEntry);
QcEntrySchema.index({ employeeId: 1, state: 1, batchYear: -1, batchMonth: -1 });
QcEntrySchema.index({ campaignChannel: 1, state: 1, batchYear: -1, batchMonth: -1 });
QcEntrySchema.index({ batchId: 1, rowIndex: 1, employeeId: 1, state: 1 });
// M10: every QC list sorts by updatedAt — compounds above miss sort field
QcEntrySchema.index({ employeeId: 1, state: 1, updatedAt: -1 });
QcEntrySchema.index({ state: 1, updatedAt: -1 });
QcEntrySchema.index({ state: 1, batchYear: -1, batchMonth: -1, updatedAt: -1 });
QcEntrySchema.index({ state: 1, campaignChannel: 1, batchYear: -1, batchMonth: -1, updatedAt: -1 });
QcEntrySchema.index({ state: 1, employeeId: 1, batchYear: -1, batchMonth: -1, updatedAt: -1 });
QcEntrySchema.index({ mergedReadyBatchId: 1 });
QcEntrySchema.index({ rootBatchId: 1, mergedReadyBatchId: 1 });
