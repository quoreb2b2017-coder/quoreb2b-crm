import { MONTHS_SHORT } from '@/lib/attendance/month-year';
import type { YearlyAnalytics } from '@/lib/api/attendance.service';

function emptyMonthRow(month: string): YearlyAnalytics {
  return {
    month,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    paidLeaveDays: 0,
    halfDays: 0,
    weekendDays: 0,
    attendancePercentage: 0,
  };
}

/** Always return exactly 12 months (Jan–Dec) for the yearly grid. */
export function normalizeYearlyRows(rows: YearlyAnalytics[] | null | undefined): YearlyAnalytics[] {
  const byKey = new Map<string, YearlyAnalytics>();
  for (const row of rows ?? []) {
    const key = row.month.toLowerCase().replace(/\./g, '').slice(0, 3);
    byKey.set(key, row);
  }
  return MONTHS_SHORT.map((short) => {
    const key = short.toLowerCase().slice(0, 3);
    return byKey.get(key) ?? emptyMonthRow(short);
  });
}

/** Sum stats for selected month indices (1–12). Empty = all months. */
export function sumYearlyByMonths(rows: YearlyAnalytics[], monthIndices?: number[]) {
  const normalized = normalizeYearlyRows(rows);
  const indices =
    monthIndices && monthIndices.length > 0
      ? monthIndices
      : normalized.map((_, i) => i + 1);
  const picked = indices.map((m) => normalized[m - 1]).filter(Boolean);
  const count = picked.length || 1;
  return {
    present: picked.reduce((s, m) => s + m.presentDays, 0),
    absent: picked.reduce((s, m) => s + m.absentDays, 0),
    leave: picked.reduce((s, m) => s + m.leaveDays, 0),
    half: picked.reduce((s, m) => s + m.halfDays, 0),
    avgPct: Math.round(
      picked.reduce((s, m) => s + m.attendancePercentage, 0) / count,
    ),
    monthCount: picked.length,
  };
}

export const ALL_MONTH_INDICES = Array.from({ length: 12 }, (_, i) => i + 1);
