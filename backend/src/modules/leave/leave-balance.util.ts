import {
  dayOfWeekFromDateKey,
  isWeekendDateKey,
  parseDateOnly,
  toDateKey,
} from '../attendance/attendance-date.util';

export function yearFromDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4));
}

/** Weekday date keys (Mon–Fri) between start and end inclusive (YYYY-MM-DD). */
export function weekdayDateKeysBetween(startDate: string, endDate: string): string[] {
  const start = parseDateOnly(startDate.slice(0, 10));
  const end = parseDateOnly(endDate.slice(0, 10));
  if (end < start) return [];

  const keys: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const key = toDateKey(cursor);
    if (!isWeekendDateKey(key)) {
      keys.push(key);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function countWeekdaysBetween(startDate: string, endDate: string): number {
  return weekdayDateKeysBetween(startDate, endDate).length;
}

export function calendarYearBounds(year: number) {
  return {
    start: parseDateOnly(`${year}-01-01`),
    end: parseDateOnly(`${year}-12-31`),
  };
}

export function dayOfWeekLabel(dateKey: string): string {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels[dayOfWeekFromDateKey(dateKey)] ?? '—';
}
