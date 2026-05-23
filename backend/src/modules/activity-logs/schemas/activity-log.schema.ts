import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ActivityLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  resource: string;

  @Prop()
  resourceId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  sessionId?: string;

  @Prop()
  path?: string;

  @Prop()
  userName?: string;

  @Prop()
  userEmail?: string;

  @Prop()
  userRole?: string;

  @Prop()
  employeeId?: string;

  /** Explicit event time (always set on write; used for display & sorting) */
  @Prop({ type: Date, default: () => new Date(), required: true })
  occurredAt: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ sessionId: 1, createdAt: -1 });
ActivityLogSchema.index({ userRole: 1, createdAt: -1 });
ActivityLogSchema.index({ action: 1, createdAt: -1 });
ActivityLogSchema.index({ resource: 1, resourceId: 1 });
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ occurredAt: -1 });
