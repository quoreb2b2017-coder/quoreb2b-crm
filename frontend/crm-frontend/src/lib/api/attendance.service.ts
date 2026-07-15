import apiClient from './client';
import { formatLocalDate } from '@/lib/attendance/date';
import { ALL_MONTH_INDICES, normalizeYearlyRows } from '@/lib/attendance/yearly-analytics';
import { MONTHS_SHORT } from '@/lib/attendance/month-year';

export interface AttendanceRecord {
  _id: string;
  userId: string;
  date: string;
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'weekend' | 'holiday';
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
    checkOutTime?: string;
    workDurationMinutes?: number;
    workDurationFormatted?: string;
    grossWorkDurationMinutes?: number;
    grossWorkDurationFormatted?: string;
    breakMinutes?: number;
    dailyTargetMet?: boolean;
    dailyGrossTargetMet?: boolean;
    /** True after Quick Punch EOD logout — day locked until tomorrow */
    eodClosed?: boolean;
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
  const raw = response.data;
  if (raw && typeof raw === 'object' && raw !== null && 'data' in raw) {
    const wrapped = raw as { success?: boolean; data?: T };
    if (wrapped.data !== undefined) {
      return wrapped.data;
    }
  }
  return raw as T;
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

  async getMonthlyAnalytics(userId: string, month?: number, year?: number, bustCache = false) {
    const params = new URLSearchParams();
    params.append('userId', userId);
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    if (bustCache) params.append('refresh', String(Date.now()));

    const res = await apiClient.get(`attendance/analytics/monthly?${params.toString()}`);
    return unwrap<AttendanceAnalytics>(res);
  },

  /**
   * Yearly rollup built from the same monthly analytics used by the daily sheet.
   * Guarantees June (etc.) matches the one-month view.
   */
  async getYearlyAnalytics(userId: string, year?: number, bustCache = false) {
    const targetYear = year ?? new Date().getFullYear();
    const monthlyResults = await Promise.all(
      ALL_MONTH_INDICES.map((month) =>
        this.getMonthlyAnalytics(userId, month, targetYear, bustCache),
      ),
    );

    const rows: YearlyAnalytics[] = MONTHS_SHORT.map((month, index) => {
      const analytics = monthlyResults[index];
      return {
        month,
        presentDays: analytics.presentDays,
        absentDays: analytics.absentDays,
        leaveDays: analytics.leaveDays,
        paidLeaveDays: analytics.paidLeaveDays,
        halfDays: analytics.halfDays,
        weekendDays: analytics.weekendDays,
        attendancePercentage: analytics.attendancePercentage,
      };
    });

    return normalizeYearlyRows(rows);
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
