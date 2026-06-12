import {
  attendanceStoredInstantMs as workspaceAttendanceStoredInstantMs,
  combineDateAndWallTime,
} from '../../common/utils/timezone.util';

/** Parse YYYY-MM-DD to UTC midnight (stable across server timezones). */
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error('Invalid date');
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthRangeUtc(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Combine calendar date (YYYY-MM-DD) with HH:mm in US Eastern → UTC Date. */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  return combineDateAndWallTime(dateStr, timeStr);
}

/** Real epoch ms for elapsed / duration (handles legacy wall-clock storage). */
export function attendanceStoredInstantMs(stored: Date, nowMs: number = Date.now()): number {
  return workspaceAttendanceStoredInstantMs(stored, nowMs);
}

/** Day of week for YYYY-MM-DD (0=Sun … 6=Sat). */
export function dayOfWeekFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Check if day is weekend (Saturday=6, Sunday=0) */
export function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function isWeekendDateKey(dateKey: string): boolean {
  return isWeekend(dayOfWeekFromDateKey(dateKey));
}
