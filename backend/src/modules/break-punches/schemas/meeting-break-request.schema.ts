import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Schema({ timestamps: true })
export class MeetingBreakRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Calendar day in US Eastern (UTC midnight) */
  @Prop({ required: true, index: true })
  date: Date;

  @Prop({
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: MeetingRequestStatus;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'BreakPunch' })
  breakPunchId?: Types.ObjectId;
}

export const MeetingBreakRequestSchema = SchemaFactory.createForClass(MeetingBreakRequest);
MeetingBreakRequestSchema.index({ userId: 1, date: 1, status: 1 });
MeetingBreakRequestSchema.index({ date: 1, status: 1, requestedAt: 1 });
