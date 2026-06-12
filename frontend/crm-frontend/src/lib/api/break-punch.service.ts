import apiClient from './client';

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

export interface BreakPunchToday {
  date: string;
  activeType: BreakType | null;
  tea: BreakTypeStatus;
  lunch: BreakTypeStatus;
  meeting: BreakTypeStatus;
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
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return {
    date,
    activeType: null,
    tea: emptyTypeStatus('Tea break', '2×15m', 30),
    lunch: emptyTypeStatus('Lunch break', '45m', 45),
    meeting: emptyTypeStatus('Meeting', '60m', 60),
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
