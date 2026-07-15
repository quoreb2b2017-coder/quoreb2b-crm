import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Attendance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({
    enum: ['present', 'absent', 'leave', 'half-day', 'weekend', 'holiday'],
    default: 'absent',
  })
  status: string;

  @Prop()
  checkInTime?: Date;

  @Prop()
  checkOutTime?: Date;

  @Prop({ default: 0 })
  hoursWorked: number;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  isPaidLeave: boolean;

  @Prop({ default: false })
  isApproved: boolean;

  /** Check-in after 9:00 AM Eastern cutoff */
  @Prop({ default: false })
  isLate: boolean;

  /** True only after Quick Punch EOD logout — blocks same-day re-punch. */
  @Prop({ default: false })
  eodClosed: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ userId: 1, date: -1 });
AttendanceSchema.index({ date: 1 });
AttendanceSchema.index({ date: -1, status: 1 });
AttendanceSchema.index({ userId: 1, date: 1, status: 1 });
