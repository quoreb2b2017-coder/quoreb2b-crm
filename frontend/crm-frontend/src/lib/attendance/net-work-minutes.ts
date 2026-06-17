import {
  DAILY_GROSS_TARGET_MINUTES,
  DAILY_NET_WORK_TARGET_MINUTES,
  SCHEDULED_SHIFT_BREAK_MINUTES,
} from '@/lib/attendance/attendance-shift.constants';

/** Tea + lunch minutes to subtract from gross for Working (7h 45m). Meeting is work time. */
export function resolveEffectiveBreakMinutes(
  grossMinutes: number,
  punchedBreakMinutes: number,
): number {
  if (grossMinutes <= 0) return 0;
  if (punchedBreakMinutes > 0) {
    return Math.min(grossMinutes, punchedBreakMinutes);
  }
  if (grossMinutes >= DAILY_GROSS_TARGET_MINUTES) {
    return Math.min(grossMinutes, SCHEDULED_SHIFT_BREAK_MINUTES);
  }
  return 0;
}

export function computeNetWorkMinutes(grossMinutes: number, punchedBreakMinutes: number): number {
  const effectiveBreaks = resolveEffectiveBreakMinutes(grossMinutes, punchedBreakMinutes);
  return Math.max(0, Math.round(grossMinutes - effectiveBreaks));
}

export function isDailyGrossQuotaMet(grossMinutes: number): boolean {
  return grossMinutes >= DAILY_GROSS_TARGET_MINUTES;
}

export function isDailyNetQuotaMet(netMinutes: number): boolean {
  return netMinutes >= DAILY_NET_WORK_TARGET_MINUTES;
}
