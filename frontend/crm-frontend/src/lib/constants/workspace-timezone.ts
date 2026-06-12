/** US Eastern — auto-handles EDT (UTC−4) and EST (UTC−5). */
export const WORKSPACE_TIMEZONE = 'America/New_York';

export const WORKSPACE_TIMEZONE_LABEL = 'Eastern Time (US — EDT/EST)';

/** YYYY-MM-DD in US Eastern (matches backend attendance / work-time). */
export function todayDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSPACE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Day of week for a calendar date key (0=Sun … 6=Sat) — same rules as backend. */
export function dayOfWeekFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekendDateKey(dateKey: string): boolean {
  const dow = dayOfWeekFromDateKey(dateKey);
  return dow === 0 || dow === 6;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function weekdayShortFromDateKey(dateKey: string): string {
  return WEEKDAY_SHORT[dayOfWeekFromDateKey(dateKey)] ?? '—';
}
