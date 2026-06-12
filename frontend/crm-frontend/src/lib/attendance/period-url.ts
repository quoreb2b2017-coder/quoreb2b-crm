import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { ALL_MONTH_INDICES } from '@/lib/attendance/yearly-analytics';

export interface AttendancePeriodState {
  view: AttendancePeriodView;
  selectedMonth: number;
  selectedYear: number;
  selectedMonths: number[];
}

function clampMonth(month: number): number {
  return Math.min(12, Math.max(1, month));
}

export function readParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function readView(params: URLSearchParams): AttendancePeriodView {
  const v = params.get('view');
  if (v === 'yearly' || v === 'custom') return v;
  return 'monthly';
}

export function readMonth(params: URLSearchParams, fallback: number): number {
  const raw = params.get('month');
  if (raw && !Number.isNaN(Number(raw))) return clampMonth(Number(raw));
  return fallback;
}

export function readYear(params: URLSearchParams, fallback: number): number {
  const raw = params.get('year');
  if (raw && !Number.isNaN(Number(raw))) return Number(raw);
  return fallback;
}

export function readMonths(params: URLSearchParams, fallbackMonth: number): number[] {
  const raw = params.get('months');
  if (raw) {
    const parsed = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((m) => m >= 1 && m <= 12);
    if (parsed.length) return [...new Set(parsed)].sort((a, b) => a - b);
  }
  return [fallbackMonth];
}

export function readPeriodFromSearchParams(
  params: URLSearchParams,
  todayMonth: number,
  todayYear: number,
): AttendancePeriodState {
  const month = readMonth(params, todayMonth);
  const view = readView(params);
  const year = readYear(params, todayYear);
  let months = readMonths(params, month);

  if (view === 'yearly') {
    months = [...ALL_MONTH_INDICES];
  }

  return {
    view,
    selectedMonth: month,
    selectedYear: year,
    selectedMonths: months,
  };
}

export function readPeriodFromUrl(
  todayMonth: number,
  todayYear: number,
): AttendancePeriodState {
  return readPeriodFromSearchParams(readParams(), todayMonth, todayYear);
}

export function buildAttendancePeriodQuery(
  period: AttendancePeriodState,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams((base ?? readParams()).toString());
  const months =
    period.view === 'yearly' ? ALL_MONTH_INDICES : period.selectedMonths;

  params.set('view', period.view);
  params.set('month', String(clampMonth(period.selectedMonth)));
  params.set('year', String(period.selectedYear));
  params.set('months', months.join(','));

  return params;
}

export function buildAttendancePageUrl(
  basePath: string,
  period: Pick<AttendancePeriodState, 'view' | 'selectedMonth' | 'selectedYear'>,
  hash?: string,
): string {
  const months =
    period.view === 'yearly'
      ? ALL_MONTH_INDICES
      : period.view === 'custom'
        ? readMonths(readParams(), period.selectedMonth)
        : [period.selectedMonth];

  const params = new URLSearchParams();
  params.set('view', period.view);
  params.set('month', String(period.selectedMonth));
  params.set('year', String(period.selectedYear));
  params.set('months', months.join(','));
  const qs = params.toString();
  const hashPart = hash ? `#${hash.replace(/^#/, '')}` : '';
  return `${basePath}?${qs}${hashPart}`;
}

export function isFullYearMonths(months: number[]): boolean {
  if (months.length < 12) return false;
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  return ALL_MONTH_INDICES.every((m, i) => sorted[i] === m);
}
