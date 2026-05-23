import apiClient from './client';

export type LeaveType = 'sick' | 'casual' | 'earned' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveApplication {
  _id: string;
  userId: string | { _id: string; firstName: string; lastName: string; email: string; employeeId?: string };
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
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

export const leaveService = {
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

  async approve(leaveId: string) {
    await apiClient.post(`leave/${leaveId}/approve`);
  },

  async reject(leaveId: string, rejectionReason: string) {
    await apiClient.post(`leave/${leaveId}/reject`, { rejectionReason });
  },
};
