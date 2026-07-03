import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { BreakType } from '../break-punch.constants';

@Schema({ timestamps: true })
export class BreakPunch extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Calendar day in US Eastern (YYYY-MM-DD stored as UTC midnight) */
  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ enum: ['tea', 'lunch', 'meeting'], required: true })
  type: BreakType;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  durationMinutes: number;

  /** Tea slot 1 or 2; lunch always 1 */
  @Prop({ default: 1 })
  slotIndex: number;

  @Prop({ default: false })
  exceededLimit: boolean;
}

export const BreakPunchSchema = SchemaFactory.createForClass(BreakPunch);
BreakPunchSchema.index({ userId: 1, date: 1, type: 1 });
BreakPunchSchema.index({ userId: 1, date: 1, endedAt: 1 });
BreakPunchSchema.index({ userId: 1, date: 1, startedAt: 1 });
BreakPunchSchema.index(
  { userId: 1, endedAt: 1 },
  { partialFilterExpression: { endedAt: null } },
);
