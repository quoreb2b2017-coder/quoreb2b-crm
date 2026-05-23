import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Leave extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['sick', 'casual', 'earned', 'unpaid'], required: true })
  leaveType: string;

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
}

export const LeaveSchema = SchemaFactory.createForClass(Leave);
LeaveSchema.index({ userId: 1, startDate: 1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ userId: 1, status: 1 });
