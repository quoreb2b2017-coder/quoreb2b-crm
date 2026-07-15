export const PAYROLL_BRANDING_KEY = 'payroll.branding';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type PayrollBranding = {
  companyName: string;
  companyAddress: string;
  companyEmail?: string;
  companyPhone?: string;
  logoDataUrl?: string;
  signDataUrl?: string;
  stampDataUrl?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryTitle?: string;
};

export const DEFAULT_PAYROLL_BRANDING: PayrollBranding = {
  companyName: 'QuoreB2B CRM',
  companyAddress: '',
  companyEmail: '',
  companyPhone: '',
  authorizedSignatoryName: 'Authorized Signatory',
  authorizedSignatoryTitle: 'HR / Accounts',
};
