import apiClient from './client';

export type LeaveType = 'sick' | 'casual' | 'earned' | 'unpaid';
export type LeavePayMode = 'paid' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveApplication {
  _id: string;
  userId: string | { _id: string; firstName: string; lastName: string; email: string; employeeId?: string };
  leaveType: LeaveType;
  payMode?: LeavePayMode;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  paidDaysApplied?: number;
  unpaidDaysApplied?: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
}

export interface PaidLeaveBalance {
  year: number;
  allowance: number;
  periodLabel: string;
  paidDaysUsed: number;
  paidDaysRemaining: number;
  unpaidDaysUsed: number;
  approvedLeaveCount: number;
}

export interface UserPaidLeaveBalance extends PaidLeaveBalance {
  userId: string;
}

export interface PaidLeaveBalancesResponse {
  year: number;
  allowancePerUser: number;
  periodLabel: string;
  users: UserPaidLeaveBalance[];
  totals: {
    userCount: number;
    allowanceTotal: number;
    paidDaysUsedTotal: number;
    paidDaysRemainingTotal: number;
    unpaidDaysUsedTotal: number;
  };
}

function unwrapLeaveList(response: { data: unknown }): LeaveApplication[] {
  const body = response.data as { data?: unknown };
  const inner = body?.data ?? body;

  if (Array.isArray(inner)) {
    return inner as LeaveApplication[];
  }

  if (inner && typeof inner === 'object') {
    const records = (inner as { records?: unknown }).records;
    if (Array.isArray(records)) {
      return records as LeaveApplication[];
    }
  }

  return [];
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export interface ApproveLeaveResult {
  leave?: LeaveApplication;
  applicantUserId?: string;
  paidDaysApplied?: number;
  unpaidDaysApplied?: number;
  balance?: PaidLeaveBalance;
}

export const leaveService = {
  async getBalance(year: number): Promise<PaidLeaveBalance> {
    const res = await apiClient.get(`leave/balance/${year}`);
    return unwrap<PaidLeaveBalance>(res);
  },

  async getBalances(year: number, userIds?: string[]): Promise<PaidLeaveBalancesResponse> {
    const params = userIds?.length ? `?userIds=${userIds.join(',')}` : '';
    const res = await apiClient.get(`leave/balances/${year}${params}`);
    return unwrap<PaidLeaveBalancesResponse>(res);
  },
  async apply(payload: {
    userId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
  }) {
    await apiClient.post('leave/apply', payload);
  },

  async getMyLeaves(status?: LeaveStatus | 'all') {
    const params = status && status !== 'all' ? `?status=${status}` : '';
    const res = await apiClient.get(`leave/my-leaves${params}`);
    return unwrapLeaveList(res);
  },

  async getApplications(status?: LeaveStatus | 'all', limit = 200) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    params.set('limit', String(limit));
    params.set('page', '1');
    const qs = params.toString();
    const res = await apiClient.get(`leave/applications?${qs}`);
    return unwrapLeaveList(res);
  },

  async approve(leaveId: string, payMode: LeavePayMode): Promise<ApproveLeaveResult> {
    const res = await apiClient.post(`leave/${leaveId}/approve`, { payMode });
    const data = unwrap<ApproveLeaveResult>(res);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('attendance:refresh'));
      if (data.balance) {
        window.dispatchEvent(
          new CustomEvent('leave:balance-updated', {
            detail: {
              userId: data.applicantUserId,
              balance: data.balance,
            },
          }),
        );
      }
    }
    return data;
  },

  async reject(leaveId: string, rejectionReason: string) {
    await apiClient.post(`leave/${leaveId}/reject`, { rejectionReason });
  },
};
