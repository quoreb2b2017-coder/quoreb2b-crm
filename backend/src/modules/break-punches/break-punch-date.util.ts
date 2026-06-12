import { calendarDateKey } from '../../common/utils/timezone.util';
import { parseDateOnly, toDateKey } from '../attendance/attendance-date.util';

export function todayDateKeyIst(): string {
  return calendarDateKey(new Date());
}

export function todayDateUtc(): Date {
  return parseDateOnly(todayDateKeyIst());
}

export function dateKeyFromUtcDate(d: Date): string {
  return toDateKey(d);
}
