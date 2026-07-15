import type { Payslip, PayrollBranding } from '@/types/payroll';

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEMO_PAYROLL_BRANDING: PayrollBranding = {
  companyName: 'QuoreB2B CRM',
  companyAddress: '3rd Floor, Tech Park, Andheri East, Mumbai 400069',
  companyEmail: 'hr@quoreb2b.com',
  companyPhone: '+91 98765 43210',
  authorizedSignatoryName: 'Priya Sharma',
  authorizedSignatoryTitle: 'Head of HR',
  // No custom logoDataUrl — slip uses real Quore logo mark
  signDataUrl: svgDataUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70"><path d="M10 45 C40 10, 70 60, 100 35 S160 15, 210 40" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round"/><path d="M25 50 C55 55, 90 25, 125 48" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>',
  ),
  stampDataUrl: svgDataUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><circle cx="80" cy="80" r="68" fill="none" stroke="#64748b" stroke-width="4"/><circle cx="80" cy="80" r="52" fill="none" stroke="#94a3b8" stroke-width="2"/><text x="80" y="78" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#0f172a">QuoreB2B</text><text x="80" y="96" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="600" fill="#64748b">AUTHORIZED</text></svg>',
  ),
};

export const DEMO_PAYSLIP: Payslip = {
  id: 'demo',
  userId: 'demo-user',
  year: 2026,
  month: 7,
  periodLabel: 'July 2026',
  employeeName: 'Rahul Verma',
  employeeId: 'EMP-1042',
  email: 'rahul.verma@quoreb2b.com',
  designation: 'Sales Executive',
  department: 'CRM Operations',
  bankName: 'HDFC Bank',
  bankAccountNumber: '5010023416789',
  ifscCode: 'HDFC0001234',
  panNumber: 'ABCDE1234F',
  earnings: {
    basic: 22000,
    hra: 8800,
    specialAllowance: 4500,
    conveyance: 1600,
    otherAllowances: 1200,
    gross: 38100,
  },
  deductions: {
    pf: 1800,
    professionalTax: 200,
    lossOfPay: 0,
    other: 500,
    total: 2500,
  },
  attendance: {
    workingDays: 23,
    presentDays: 20,
    halfDays: 1,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    absentDays: 1,
    payableDays: 21.5,
    lopDays: 1.5,
  },
  netPay: 35600,
  netPayInWords: 'Thirty Five Thousand Six Hundred Rupees Only',
  generatedAt: '2026-07-14T12:00:00.000Z',
  branding: DEMO_PAYROLL_BRANDING,
};
