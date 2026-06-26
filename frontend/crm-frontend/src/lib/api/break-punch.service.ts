import apiClient from './client';
import { todayDateKey } from '@/lib/constants/workspace-timezone';

export type BreakType = 'tea' | 'lunch' | 'meeting';

export interface BreakSession {
  id: string;
  type: BreakType;
  slotIndex: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  limitMinutes: number;
  exceededLimit: boolean;
  isActive: boolean;
}

export interface BreakTypeStatus {
  label: string;
  hint: string;
  dailyBudgetMinutes: number;
  usedMinutes: number;
  usedMinutesCompleted: number;
  remainingMinutes: number;
  remainingSeconds: number;
  punchCount: number;
  canStart: boolean;
  isActive: boolean;
  activeElapsedSeconds: number;
  sessions: BreakSession[];
}

export interface MeetingRequestInfo {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedAt: string;
  reviewedAt: string | null;
}

export interface PendingMeetingRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedAt: string;
}

export interface BreakPunchToday {
  date: string;
  activeType: BreakType | null;
  tea: BreakTypeStatus;
  lunch: BreakTypeStatus;
  meeting: BreakTypeStatus;
  meetingRequest: MeetingRequestInfo | null;
}

function emptyTypeStatus(
  label: string,
  hint: string,
  dailyBudgetMinutes: number,
): BreakTypeStatus {
  return {
    label,
    hint,
    dailyBudgetMinutes,
    usedMinutes: 0,
    usedMinutesCompleted: 0,
    remainingMinutes: dailyBudgetMinutes,
    remainingSeconds: dailyBudgetMinutes * 60,
    punchCount: 0,
    canStart: true,
    isActive: false,
    activeElapsedSeconds: 0,
    sessions: [],
  };
}

export function createEmptyBreakPunchToday(): BreakPunchToday {
  const date = todayDateKey();
  return {
    date,
    activeType: null,
    tea: emptyTypeStatus('Tea break', '2×15m', 30),
    lunch: emptyTypeStatus('Lunch break', '45m', 45),
    meeting: emptyTypeStatus('Meeting', '60m', 60),
    meetingRequest: null,
  };
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const breakPunchService = {
  async getToday(): Promise<BreakPunchToday> {
    const res = await apiClient.get('break-punches/today');
    return unwrap<BreakPunchToday>(res);
  },

  async toggle(type: BreakType): Promise<BreakPunchToday> {
    const res = await apiClient.post('break-punches/toggle', { type });
    return unwrap<BreakPunchToday>(res);
  },

  async requestMeeting(): Promise<BreakPunchToday> {
    const res = await apiClient.post('break-punches/meeting/request');
    return unwrap<BreakPunchToday>(res);
  },

  async listPendingMeetingRequests(): Promise<PendingMeetingRequest[]> {
    const res = await apiClient.get('break-punches/meeting/requests/pending');
    return unwrap<PendingMeetingRequest[]>(res);
  },

  async approveMeetingRequest(requestId: string): Promise<BreakPunchToday> {
    const res = await apiClient.post(`break-punches/meeting/requests/${requestId}/approve`);
    return unwrap<BreakPunchToday>(res);
  },

  async rejectMeetingRequest(requestId: string): Promise<BreakPunchToday> {
    const res = await apiClient.post(`break-punches/meeting/requests/${requestId}/reject`);
    return unwrap<BreakPunchToday>(res);
  },
};

export function formatRemainingSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `${m}m ${rem}s`;
  return `${rem}s`;
}

export function formatRemainingShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/** Human-readable break time used (e.g. "5m", "2m 30s"). */
export function formatBreakDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0 && rem === 0) return '0m';
  if (rem === 0) return `${m}m`;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}
