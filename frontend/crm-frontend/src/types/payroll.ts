export interface PayrollBranding {
  companyName: string;
  companyAddress: string;
  companyEmail?: string;
  companyPhone?: string;
  logoDataUrl?: string;
  signDataUrl?: string;
  stampDataUrl?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryTitle?: string;
}

export interface EmployeeCompensationRow {
  id: string;
  userId: string;
  employeeName: string;
  employeeId: string;
  email: string;
  basicSalary: number;
  hra: number;
  specialAllowance: number;
  conveyance: number;
  otherAllowances: number;
  pfDeduction: number;
  professionalTax: number;
  otherDeductions: number;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  panNumber: string;
  designation: string;
  department: string;
  monthlyGross: number;
}

export interface PayslipEarnings {
  basic: number;
  hra: number;
  specialAllowance: number;
  conveyance: number;
  otherAllowances: number;
  gross: number;
}

export interface PayslipDeductions {
  pf: number;
  professionalTax: number;
  lossOfPay: number;
  other: number;
  total: number;
}

export interface PayslipAttendance {
  workingDays: number;
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  payableDays: number;
  lopDays: number;
}

export interface Payslip {
  id: string;
  userId: string;
  year: number;
  month: number;
  periodLabel: string;
  employeeName: string;
  employeeId: string;
  email: string;
  designation: string;
  department: string;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  panNumber: string;
  earnings: PayslipEarnings;
  deductions: PayslipDeductions;
  attendance: PayslipAttendance;
  netPay: number;
  netPayInWords: string;
  generatedAt?: string;
  branding?: PayrollBranding;
}

export interface UpsertCompensationPayload {
  userId: string;
  basicSalary: number;
  hra?: number;
  specialAllowance?: number;
  conveyance?: number;
  otherAllowances?: number;
  pfDeduction?: number;
  professionalTax?: number;
  otherDeductions?: number;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  panNumber?: string;
  designation?: string;
  department?: string;
}
