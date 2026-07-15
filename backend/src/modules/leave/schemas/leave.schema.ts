import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Leave extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['sick', 'casual', 'earned', 'unpaid'], required: true })
  leaveType: string;

  /** Set by Super Admin on approve — paid uses annual allowance, unpaid is LOP */
  @Prop({ enum: ['paid', 'unpaid'] })
  payMode?: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true })
  numberOfDays: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvalDate?: Date;

  @Prop()
  rejectionReason?: string;

  /** Weekdays marked as paid leave when approved (counts toward annual allowance). */
  @Prop({ default: 0 })
  paidDaysApplied: number;

  /** Weekdays marked as unpaid leave when approved. */
  @Prop({ default: 0 })
  unpaidDaysApplied: number;
}

export const LeaveSchema = SchemaFactory.createForClass(Leave);
LeaveSchema.index({ userId: 1, startDate: 1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ userId: 1, status: 1 });
