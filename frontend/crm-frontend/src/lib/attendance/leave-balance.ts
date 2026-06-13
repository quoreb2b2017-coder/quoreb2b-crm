import { dayOfWeekFromDateKey, isWeekendDateKey } from '@/lib/constants/workspace-timezone';

export const ANNUAL_PAID_LEAVE_ALLOWANCE = 18;

export function weekdayDateKeysBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endDate.slice(0, 10)}T12:00:00`);
  if (end < start) return [];

  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    if (!isWeekendDateKey(key)) {
      keys.push(key);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function countWeekdaysBetween(startDate: string, endDate: string): number {
  return weekdayDateKeysBetween(startDate, endDate).length;
}

export function dayOfWeekFromKey(dateKey: string): number {
  return dayOfWeekFromDateKey(dateKey);
}
