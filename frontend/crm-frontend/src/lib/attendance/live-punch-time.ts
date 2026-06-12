import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';

function timezoneOffsetMs(at: Date, timeZone = WORKSPACE_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - at.getTime();
}

/**
 * Recover the real punch instant from an ISO timestamp returned by attendance APIs.
 * Legacy wall-clock-in-UTC storage is adjusted using the workspace timezone offset.
 */
export function punchInInstantMs(
  punchInAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!punchInAt) return nowMs;
  const stored = new Date(punchInAt).getTime();
  if (!Number.isFinite(stored)) return nowMs;
  if (stored > nowMs + 60_000) {
    return stored - timezoneOffsetMs(new Date(stored));
  }
  return stored;
}

/** Elapsed seconds since punch-in using client clock (immune to stale API elapsed). */
export function elapsedSecondsSincePunchIn(
  punchInAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  const start = punchInInstantMs(punchInAt, nowMs);
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

export function grossMinutesFromElapsedSeconds(elapsedSeconds: number): number {
  const max = 24 * 60;
  return Math.min(max, Math.floor(Math.max(0, elapsedSeconds) / 60));
}
