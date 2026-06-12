import { WORKSPACE_TIMEZONE } from '../constants/workspace-timezone.constant';

/** YYYY-MM-DD in the workspace timezone (US Eastern). */
export function calendarDateKey(d: Date, timeZone = WORKSPACE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatTime12hInZone(d: Date, timeZone = WORKSPACE_TIMEZONE): string {
  return d.toLocaleString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function currentTimeHHmm(timeZone = WORKSPACE_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

export function isTodayDateKey(dateStr: string, timeZone = WORKSPACE_TIMEZONE): boolean {
  return dateStr === calendarDateKey(new Date(), timeZone);
}

/** UTC instant of the next midnight after `cursor` in the workspace timezone. */
export function nextCalendarMidnightMs(cursor: Date, timeZone = WORKSPACE_TIMEZONE): number {
  const key = calendarDateKey(cursor, timeZone);
  let lo = cursor.getTime();
  let hi = lo + 36 * 3600000;
  while (calendarDateKey(new Date(hi), timeZone) === key) {
    hi += 3600000;
  }
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (calendarDateKey(new Date(mid), timeZone) === key) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function timezoneOffsetMs(at: Date, timeZone = WORKSPACE_TIMEZONE): number {
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

/** Local wall date + HH:mm in workspace TZ → real UTC Date. */
export function combineDateAndWallTime(
  dateStr: string,
  timeStr: string,
  timeZone = WORKSPACE_TIMEZONE,
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  let utc = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  for (let i = 0; i < 2; i++) {
    utc -= timezoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

/** HH:mm in workspace timezone from a stored instant. */
export function formatWallTimeHHmm(date: Date, timeZone = WORKSPACE_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * Recover real epoch ms from legacy wall-clock-in-UTC-slot storage.
 * Fresh data uses real UTC from combineDateAndWallTime.
 */
export function attendanceStoredInstantMs(
  stored: Date,
  nowMs: number = Date.now(),
  timeZone = WORKSPACE_TIMEZONE,
): number {
  const t = stored.getTime();
  if (!Number.isFinite(t)) return nowMs;
  if (t > nowMs + 60_000) {
    return t - timezoneOffsetMs(stored, timeZone);
  }
  return t;
}
