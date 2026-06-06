import apiClient from './client';
import { formatLocalDate } from '@/lib/attendance/date';

export interface AttendanceRecord {
  _id: string;
  userId: string;
  date: string;
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'weekend';
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked: number;
  notes?: string;
  isPaidLeave?: boolean;
  isApproved: boolean;
}

export interface AttendanceAnalytics {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  paidLeaveDays: number;
  halfDays: number;
  weekendDays: number;
  lateDays: number;
  attendancePercentage: number;
  totalHoursWorked: number;
  dailyBreakdown: Array<{
    date: string;
    status: string;
    hoursWorked: number;
    isPaidLeave?: boolean;
    isLate?: boolean;
    checkInTime?: string;
  }>;
}

export interface YearlyAnalytics {
  month: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  paidLeaveDays: number;
  halfDays: number;
  weekendDays: number;
  attendancePercentage: number;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const attendanceService = {
  async markAttendance(
    userId: string,
    date: Date | string,
    status: string,
    hoursWorked?: number,
    notes?: string,
    times?: { checkIn?: string; checkOut?: string },
    isPaidLeave?: boolean,
  ) {
    const dateStr = typeof date === 'string' ? date : formatLocalDate(date);
    const res = await apiClient.post('attendance/mark', {
      userId,
      date: dateStr,
      status,
      hoursWorked,
      notes,
      checkInTime: times?.checkIn,
      checkOutTime: times?.checkOut,
      isPaidLeave,
    });
    return unwrap(res);
  },

  async getRecords(userId?: string, startDate?: Date, endDate?: Date, page = 1, limit = 50) {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const res = await apiClient.get(`attendance/records?${params.toString()}`);
    return unwrap(res);
  },

  async getMonthlyAnalytics(userId: string, month?: number, year?: number) {
    const params = new URLSearchParams();
    params.append('userId', userId);
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const res = await apiClient.get(`attendance/analytics/monthly?${params.toString()}`);
    return unwrap<AttendanceAnalytics>(res);
  },

  async getYearlyAnalytics(userId: string, year?: number) {
    const params = new URLSearchParams();
    params.append('userId', userId);
    if (year) params.append('year', year.toString());

    const res = await apiClient.get(`attendance/analytics/yearly?${params.toString()}`);
    return unwrap<YearlyAnalytics[]>(res);
  },

  async getTeamAnalytics(userIds: string[], month?: number, year?: number) {
    const params = new URLSearchParams();
    params.append('userIds', userIds.join(','));
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const res = await apiClient.get(`attendance/analytics/team?${params.toString()}`);
    return unwrap<
      Array<{
        userId: string;
        presentDays: number;
        absentDays: number;
        leaveDays: number;
        paidLeaveDays: number;
        halfDays: number;
        weekendDays: number;
        attendancePercentage: number;
      }>
    >(res);
  },
};
