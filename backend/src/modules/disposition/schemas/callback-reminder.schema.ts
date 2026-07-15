import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallbackReminderStatus = 'scheduled' | 'due' | 'dismissed';
export type CallbackReminderHours = 24 | 48;

@Schema({ timestamps: true })
export class CallbackReminder extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  rootBatchId?: Types.ObjectId;

  @Prop({ required: true })
  campaignName: string;

  @Prop({ required: true, min: 0 })
  rowIndex: number;

  @Prop({ required: true })
  leadKey: string;

  @Prop()
  leadLabel?: string;

  @Prop({ required: true, enum: [24, 48] })
  hours: CallbackReminderHours;

  @Prop({ required: true, maxlength: 500 })
  description: string;

  @Prop({ required: true })
  remindAt: Date;

  @Prop({
    required: true,
    enum: ['scheduled', 'due', 'dismissed'],
    default: 'scheduled',
    index: true,
  })
  status: CallbackReminderStatus;

  @Prop()
  dismissedAt?: Date;
}

export const CallbackReminderSchema = SchemaFactory.createForClass(CallbackReminder);
CallbackReminderSchema.index({ employeeId: 1, status: 1, remindAt: 1 });
CallbackReminderSchema.index({ batchId: 1, rowIndex: 1, employeeId: 1, status: 1 });
