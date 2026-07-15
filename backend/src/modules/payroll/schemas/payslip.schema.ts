import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class PayslipEarnings {
  @Prop({ default: 0 }) basic: number;
  @Prop({ default: 0 }) hra: number;
  @Prop({ default: 0 }) specialAllowance: number;
  @Prop({ default: 0 }) conveyance: number;
  @Prop({ default: 0 }) otherAllowances: number;
  @Prop({ default: 0 }) gross: number;
}

@Schema({ _id: false })
export class PayslipDeductions {
  @Prop({ default: 0 }) pf: number;
  @Prop({ default: 0 }) professionalTax: number;
  @Prop({ default: 0 }) lossOfPay: number;
  @Prop({ default: 0 }) other: number;
  @Prop({ default: 0 }) total: number;
}

@Schema({ _id: false })
export class PayslipAttendanceSummary {
  @Prop({ default: 0 }) workingDays: number;
  @Prop({ default: 0 }) presentDays: number;
  @Prop({ default: 0 }) halfDays: number;
  @Prop({ default: 0 }) paidLeaveDays: number;
  @Prop({ default: 0 }) unpaidLeaveDays: number;
  @Prop({ default: 0 }) absentDays: number;
  @Prop({ default: 0 }) payableDays: number;
  @Prop({ default: 0 }) lopDays: number;
}

@Schema({ timestamps: true, collection: 'payslips' })
export class Payslip extends Document {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  year: number;

  @Prop({ required: true, min: 1, max: 12, index: true })
  month: number;

  @Prop({ required: true })
  periodLabel: string;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ default: '' })
  employeeId: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  designation: string;

  @Prop({ default: '' })
  department: string;

  @Prop({ default: '' })
  bankName: string;

  @Prop({ default: '' })
  bankAccountNumber: string;

  @Prop({ default: '' })
  ifscCode: string;

  @Prop({ default: '' })
  panNumber: string;

  @Prop({ type: PayslipEarnings, required: true })
  earnings: PayslipEarnings;

  @Prop({ type: PayslipDeductions, required: true })
  deductions: PayslipDeductions;

  @Prop({ type: PayslipAttendanceSummary, required: true })
  attendance: PayslipAttendanceSummary;

  @Prop({ required: true, min: 0 })
  netPay: number;

  @Prop({ default: '' })
  netPayInWords: string;

  @Prop({ default: '' })
  generatedBy: string;

  @Prop({ default: () => new Date() })
  generatedAt: Date;
}

export const PayslipSchema = SchemaFactory.createForClass(Payslip);
PayslipSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });
