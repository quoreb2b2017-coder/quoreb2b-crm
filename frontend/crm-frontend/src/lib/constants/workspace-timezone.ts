/** US Eastern — auto-handles EDT (UTC−4) and EST (UTC−5). */
export const WORKSPACE_TIMEZONE = 'America/New_York';

export const WORKSPACE_TIMEZONE_LABEL = 'Eastern Time (ET)';

/** YYYY-MM-DD in US Eastern (matches backend attendance / work-time). */
export function todayDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSPACE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
