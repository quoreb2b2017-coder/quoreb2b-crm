import apiClient from '@/lib/api/client';
import type {
  EmployeeCompensationRow,
  Payslip,
  PayrollBranding,
  UpsertCompensationPayload,
} from '@/types/payroll';

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

function unwrapList<T>(response: { data: unknown }): T[] {
  const body = response.data as { data?: T | T[] | { data?: T[] } };
  const inner = body?.data ?? body;
  if (Array.isArray(inner)) return inner;
  if (inner && typeof inner === 'object' && Array.isArray((inner as { data?: T[] }).data)) {
    return (inner as { data: T[] }).data;
  }
  return [];
}

export const DEFAULT_BRANDING_CLIENT: PayrollBranding = {
  companyName: 'QuoreB2B CRM',
  companyAddress: '',
  companyEmail: '',
  companyPhone: '',
  authorizedSignatoryName: 'Authorized Signatory',
  authorizedSignatoryTitle: 'HR / Accounts',
};

export const payrollService = {
  async getBranding(): Promise<PayrollBranding> {
    const res = await apiClient.get('payroll/branding');
    const brand = unwrap<PayrollBranding>(res);
    return { ...DEFAULT_BRANDING_CLIENT, ...brand };
  },

  async updateBranding(
    payload: Partial<PayrollBranding> & {
      clearLogo?: boolean;
      clearSign?: boolean;
      clearStamp?: boolean;
    },
  ): Promise<PayrollBranding> {
    const clean = { ...payload };
    if (typeof clean.companyEmail === 'string' && !clean.companyEmail.trim()) {
      clean.companyEmail = '';
    }
    const res = await apiClient.put('payroll/branding', clean);
    const brand = unwrap<PayrollBranding>(res);
    return { ...DEFAULT_BRANDING_CLIENT, ...brand };
  },

  async listCompensations(): Promise<EmployeeCompensationRow[]> {
    const res = await apiClient.get('payroll/compensations');
    return unwrapList<EmployeeCompensationRow>(res);
  },

  async upsertCompensation(payload: UpsertCompensationPayload) {
    const res = await apiClient.put('payroll/compensations', payload);
    return unwrap(res);
  },

  async generatePayslip(payload: {
    userId: string;
    year: number;
    month: number;
  }): Promise<Payslip> {
    const res = await apiClient.post('payroll/payslips/generate', payload);
    return unwrap<Payslip>(res);
  },

  async listPayslips(params?: {
    year?: number;
    month?: number;
    userId?: string;
  }): Promise<{
    data: Payslip[];
    branding: PayrollBranding;
  }> {
    const res = await apiClient.get('payroll/payslips', { params });
    const body = unwrap<{ data?: Payslip[]; branding?: PayrollBranding } | Payslip[]>(res);
    if (Array.isArray(body)) {
      return { data: body, branding: DEFAULT_BRANDING_CLIENT };
    }
    return {
      data: Array.isArray(body?.data) ? body.data : [],
      branding: { ...DEFAULT_BRANDING_CLIENT, ...(body?.branding ?? {}) },
    };
  },

  async getMyPayslip(
    year: number,
    month: number,
  ): Promise<{
    payslip: Payslip | null;
    branding: PayrollBranding;
  }> {
    const res = await apiClient.get('payroll/payslips/mine', { params: { year, month } });
    const body = unwrap<{ payslip: Payslip | null; branding: PayrollBranding }>(res);
    return {
      payslip: body?.payslip ?? null,
      branding: { ...DEFAULT_BRANDING_CLIENT, ...(body?.branding ?? {}) },
    };
  },

  async getPayslip(id: string): Promise<Payslip> {
    const res = await apiClient.get(`payroll/payslips/${id}`);
    return unwrap<Payslip>(res);
  },
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      reject(new Error('Image must be under 1.5 MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}
