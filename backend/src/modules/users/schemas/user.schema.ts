import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PanelType, SystemRole } from '../../../common/constants/roles.constant';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: [String], default: [SystemRole.EMPLOYEE] })
  roles: string[];

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ enum: PanelType, default: PanelType.CRM })
  panel: PanelType;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  avatar?: string;

  @Prop({ unique: true, sparse: true, trim: true })
  employeeId?: string;

  @Prop()
  companyId?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ select: false })
  plainPassword?: string;

  @Prop({
    type: {
      enabled: { type: Boolean, default: true },
      toastEnabled: { type: Boolean, default: true },
      emailAlerts: { type: Boolean, default: false },
      batchAlerts: { type: Boolean, default: true },
      leaveAlerts: { type: Boolean, default: true },
      attendanceAlerts: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true },
      activityAlerts: { type: Boolean, default: true },
    },
    default: () => ({
      enabled: true,
      toastEnabled: true,
      emailAlerts: false,
      batchAlerts: true,
      leaveAlerts: true,
      attendanceAlerts: true,
      systemAlerts: true,
      activityAlerts: true,
    }),
  })
  notificationPreferences?: Record<string, boolean>;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ roles: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ isActive: 1, roles: 1, firstName: 1, lastName: 1 });
UserSchema.index({ isActive: 1, createdAt: -1 });
UserSchema.index({ firstName: 1, lastName: 1 });
UserSchema.index({ roles: 1, isActive: 1 });
