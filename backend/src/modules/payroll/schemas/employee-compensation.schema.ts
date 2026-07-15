import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'employee_compensations' })
export class EmployeeCompensation extends Document {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ required: true, min: 0, default: 0 })
  basicSalary: number;

  @Prop({ min: 0, default: 0 })
  hra: number;

  @Prop({ min: 0, default: 0 })
  specialAllowance: number;

  @Prop({ min: 0, default: 0 })
  conveyance: number;

  @Prop({ min: 0, default: 0 })
  otherAllowances: number;

  @Prop({ min: 0, default: 0 })
  pfDeduction: number;

  @Prop({ min: 0, default: 0 })
  professionalTax: number;

  @Prop({ min: 0, default: 0 })
  otherDeductions: number;

  @Prop({ trim: true, default: '' })
  bankName: string;

  @Prop({ trim: true, default: '' })
  bankAccountNumber: string;

  @Prop({ trim: true, default: '' })
  ifscCode: string;

  @Prop({ trim: true, default: '' })
  panNumber: string;

  @Prop({ trim: true, default: '' })
  designation: string;

  @Prop({ trim: true, default: '' })
  department: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const EmployeeCompensationSchema = SchemaFactory.createForClass(EmployeeCompensation);
