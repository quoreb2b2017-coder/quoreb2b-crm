import {
  WORKSPACE_TIMEZONE,
  WORKSPACE_TIMEZONE_LABEL,
  todayDateKey,
} from '@/lib/constants/workspace-timezone';

export { WORKSPACE_TIMEZONE, WORKSPACE_TIMEZONE_LABEL, todayDateKey };

export const WORKSPACE_LOCALE = 'en-US';

const TZ = { timeZone: WORKSPACE_TIMEZONE };

function parseInstant(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatInWorkspace(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = parseInstant(value);
  if (!d) return '—';
  return d.toLocaleString(WORKSPACE_LOCALE, { ...TZ, ...options });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDateTimeLong(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateShort(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateMedium(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, { dateStyle: 'medium' });
}

export function formatTimeShort(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatTimeHHmm(value: string | Date | null | undefined): string {
  return formatInWorkspace(value, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatMonthYear(value: string | Date): string {
  return formatInWorkspace(value, { month: 'long', year: 'numeric' });
}

export function formatWeekdayShort(value: string | Date): string {
  return formatInWorkspace(value, { weekday: 'short' });
}

/** YYYY-MM-DD key → readable date in US Eastern */
export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
): string {
  return formatInWorkspace(`${dateKey}T12:00:00`, options);
}

export function formatNumber(n: number): string {
  return n.toLocaleString(WORKSPACE_LOCALE);
}

export function workspaceDayDiff(from: Date, to: Date = new Date()): number {
  const fromKey = todayDateKey(from);
  const toKey = todayDateKey(to);
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}
