import { WORKSPACE_TIMEZONE } from '../../common/constants/workspace-timezone.constant';
import {
  calendarDateKey,
  currentTimeHHmm as workspaceCurrentTimeHHmm,
  formatWallTimeHHmm,
  isTodayDateKey as workspaceIsTodayDateKey,
} from '../../common/utils/timezone.util';
import { SHIFT_LOGIN_TIME } from './attendance-shift.constants';

/** On-time login / check-in by 9:00 AM Eastern. */
export const ATTENDANCE_ON_TIME_CUTOFF = SHIFT_LOGIN_TIME;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isLateCheckIn(
  checkInTime: string,
  cutoff = ATTENDANCE_ON_TIME_CUTOFF,
): boolean {
  return timeToMinutes(checkInTime) > timeToMinutes(cutoff);
}

/** HH:mm in US Eastern from a stored UTC instant. */
export function formatStoredTime(date: Date): string {
  return formatWallTimeHHmm(date, WORKSPACE_TIMEZONE);
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function currentTimeHHmm(timeZone = WORKSPACE_TIMEZONE): string {
  return workspaceCurrentTimeHHmm(timeZone);
}

export function todayDateKey(timeZone = WORKSPACE_TIMEZONE): string {
  return calendarDateKey(new Date(), timeZone);
}

export function isTodayDateKey(dateStr: string, timeZone = WORKSPACE_TIMEZONE): boolean {
  return workspaceIsTodayDateKey(dateStr, timeZone);
}
