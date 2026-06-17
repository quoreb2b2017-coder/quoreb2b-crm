import { punchInInstantMs } from '@/lib/attendance/live-punch-time';

const MAX_DAY_MINUTES = 24 * 60;

export interface GrossLoginOptions {
  onDuty?: boolean;
  activeBreak?: boolean;
  punchedBreakMinutes?: number;
}

/**
 * Gross login spans first check-in → now (on duty) or through break gaps,
 * so tea/lunch/meeting time stays inside login time even after break ends.
 */
export function resolveGrossLoginMinutes(
  sessionGrossMinutes: number,
  checkInAt: string | null | undefined,
  opts: GrossLoginOptions = {},
  nowMs: number = Date.now(),
): number {
  if (!checkInAt) return sessionGrossMinutes;

  const onDuty = opts.onDuty ?? false;
  const activeBreak = opts.activeBreak ?? false;
  const punchedBreakMinutes = opts.punchedBreakMinutes ?? 0;
  // Active tea/lunch/meeting always extends login span (even before minutes accrue).
  const includeBreakGaps =
    onDuty || activeBreak || punchedBreakMinutes > 0;
  if (!includeBreakGaps) return sessionGrossMinutes;

  const inMs = punchInInstantMs(checkInAt, nowMs);
  const spanMinutes = Math.min(
    MAX_DAY_MINUTES,
    Math.max(0, Math.floor((nowMs - inMs) / 60_000)),
  );
  return Math.max(sessionGrossMinutes, spanMinutes);
}

/** @deprecated Use resolveGrossLoginMinutes */
export function extendGrossForContinuingBreak(
  sessionGrossMinutes: number,
  checkInAt: string | null | undefined,
  hasActiveBreak: boolean,
  nowMs: number = Date.now(),
): number {
  return resolveGrossLoginMinutes(
    sessionGrossMinutes,
    checkInAt,
    { activeBreak: hasActiveBreak },
    nowMs,
  );
}
