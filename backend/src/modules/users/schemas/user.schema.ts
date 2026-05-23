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
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ roles: 1 });
UserSchema.index({ companyId: 1 });
