import { punchInInstantMs } from '@/lib/attendance/live-punch-time';

const MAX_DAY_MINUTES = 24 * 60;

const LOGOUT_CONTINUING_BREAK_TYPES = new Set(['tea', 'lunch', 'meeting']);

export interface BreakSessionLike {
  startedAt: string;
  endedAt?: string | null;
  type?: string;
}

export interface GrossLoginOptions {
  onDuty?: boolean;
  activeBreak?: boolean;
  checkOutAt?: string | null;
  breakSessions?: BreakSessionLike[];
}

function resolveGrossLoginEndMs(
  nowMs: number,
  onDuty: boolean,
  activeBreak: boolean,
  checkOutAt?: string | null,
  breakSessions: BreakSessionLike[] = [],
): number {
  if (onDuty || activeBreak) return nowMs;

  if (!checkOutAt) return 0;

  let endMs = new Date(checkOutAt).getTime();
  const checkoutMs = endMs;

  for (const session of breakSessions) {
    if (session.type && !LOGOUT_CONTINUING_BREAK_TYPES.has(session.type)) continue;
    const startMs = new Date(session.startedAt).getTime();
    if (startMs > checkoutMs) continue;
    if (!session.endedAt) continue;
    const sessionEndMs = new Date(session.endedAt).getTime();
    if (sessionEndMs > endMs) {
      endMs = sessionEndMs;
    }
  }
  return endMs;
}

/**
 * Live clock runs ONLY while on duty or during an active tea/lunch/approved meeting punch.
 * Logout pauses immediately; only an active break punch keeps time running after logout.
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

  if (!onDuty && !activeBreak) {
    const endMs = resolveGrossLoginEndMs(
      nowMs,
      false,
      false,
      opts.checkOutAt,
      opts.breakSessions ?? [],
    );
    if (endMs <= 0) return sessionGrossMinutes;
    const checkoutMs = opts.checkOutAt ? new Date(opts.checkOutAt).getTime() : 0;
    if (!checkoutMs || endMs <= checkoutMs) {
      return sessionGrossMinutes;
    }
    const inMs = punchInInstantMs(checkInAt, endMs);
    const spanMinutes = Math.min(
      MAX_DAY_MINUTES,
      Math.max(0, Math.floor((endMs - inMs) / 60_000)),
    );
    return Math.max(sessionGrossMinutes, spanMinutes);
  }

  const endMs = resolveGrossLoginEndMs(
    nowMs,
    onDuty,
    activeBreak,
    opts.checkOutAt,
    opts.breakSessions ?? [],
  );

  const inMs = punchInInstantMs(checkInAt, endMs);
  const spanMinutes = Math.min(
    MAX_DAY_MINUTES,
    Math.max(0, Math.floor((endMs - inMs) / 60_000)),
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
