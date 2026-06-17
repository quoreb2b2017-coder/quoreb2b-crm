import apiClient from './client';

export interface DailyWorkTimeRow {
  date: string;
  dayLabel: string;
  totalMinutes: number;
  totalFormatted: string;
  grossMinutes?: number;
  breakMinutes?: number;
  dailyTargetMet?: boolean;
  isToday: boolean;
}

export interface TodaySessionRow {
  index: number;
  sessionId: string;
  loginAt: string;
  logoutAt?: string;
  loginTime: string;
  logoutTime?: string;
  durationMinutes: number;
  durationFormatted: string;
  stillActive: boolean;
}

export interface WorkTimeMe {
  period: { year: number; month: number; label: string };
  monthlyMinutes: number;
  monthlyFormatted: string;
  todayMinutes: number;
  todayFormatted: string;
  todayGrossMinutes?: number;
  todayBreakMinutes?: number;
  todayBreakMinutesCompleted?: number;
  /** Net minutes for 7h45m target (includes active break deduction). */
  todayMinutesAtTarget?: number;
  onBreak?: boolean;
  dailyTargetMinutes?: number;
  dailyBreakdown: DailyWorkTimeRow[];
  isTimerRunning: boolean;
  /** First LOGIN of today (US Eastern). */
  todayFirstLoginTime?: string;
  /** First attendance check-in instant (for live gross while break continues). */
  todayCheckInAt?: string;
  /** Last LOGOUT of today when off duty. */
  todayLastLogoutTime?: string;
  isOnDuty?: boolean;
  todaySessions?: TodaySessionRow[];
  currentSession: {
    sessionId: string;
    loginAt: string;
    elapsedSeconds: number;
    elapsedFormatted: string;
    isActive: boolean;
  } | null;
}

export interface TeamWorkTimeUser {
  userId: string;
  monthlyMinutes: number;
  monthlyFormatted: string;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const workTimeService = {
  async getMyWorkTime(): Promise<WorkTimeMe> {
    const res = await apiClient.get('activity-logs/work-time/me');
    return unwrap<WorkTimeMe>(res);
  },

  async getTeamWorkTime(userIds: string[], year: number, month: number) {
    const params = new URLSearchParams();
    params.set('userIds', userIds.join(','));
    params.set('year', String(year));
    params.set('month', String(month));
    const res = await apiClient.get(`activity-logs/work-time/team?${params.toString()}`);
    return unwrap<{ period: { label: string }; users: TeamWorkTimeUser[] }>(res);
  },
};

export function formatDurationFromMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function formatElapsedSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}
