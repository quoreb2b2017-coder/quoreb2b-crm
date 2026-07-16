import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DispositionKind } from '../disposition.constants';
import { QcCampaignChannel } from '../../qc/qc.constants';

@Schema({ timestamps: true })
export class DispositionEntry extends Document {
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

  @Prop({
    required: true,
    enum: [
      'do_not_call',
      'direct_voicemail',
      'call_after_3_months',
      'call_after_6_months',
    ],
  })
  dispositionKind: DispositionKind;

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
}

export const DispositionEntrySchema = SchemaFactory.createForClass(DispositionEntry);
DispositionEntrySchema.index({ dispositionKind: 1, batchYear: -1, batchMonth: -1, updatedAt: -1 });
DispositionEntrySchema.index({ employeeId: 1, dispositionKind: 1, batchYear: -1, batchMonth: -1 });
DispositionEntrySchema.index({ batchId: 1, rowIndex: 1, employeeId: 1, dispositionKind: 1 });
DispositionEntrySchema.index({ rootBatchId: 1, dispositionKind: 1, batchYear: -1, batchMonth: -1 });
