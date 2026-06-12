import { todayDateKey } from '@/lib/constants/workspace-timezone';

/** YYYY-MM-DD in US Eastern (workspace timezone). */
export function formatLocalDate(d: Date = new Date()): string {
  return todayDateKey(d);
}
