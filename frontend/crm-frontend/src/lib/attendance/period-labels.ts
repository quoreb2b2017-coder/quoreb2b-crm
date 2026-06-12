import { MONTHS, MONTHS_SHORT } from '@/lib/attendance/month-year';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';

export function formatSelectedMonthsShort(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  if (sorted.length >= 12) return 'Jan – Dec';
  if (sorted.length <= 4) {
    return sorted.map((m) => MONTHS_SHORT[m - 1]).join(', ');
  }
  return `${sorted.length} months`;
}

export function periodViewTitle(
  view: AttendancePeriodView,
  year: number,
  monthLabel: string,
  selectedMonths: number[],
): string {
  if (view === 'yearly') return `Full year ${year}`;
  if (view === 'custom') {
    return `${formatSelectedMonthsShort(selectedMonths)} · ${year}`;
  }
  return monthLabel;
}

export function periodViewDescription(view: AttendancePeriodView): string {
  if (view === 'yearly') {
    return 'Monthly rollup for all 12 months — click any month row to open its daily log.';
  }
  if (view === 'custom') {
    return 'Tick 2 or more months in the picker, then Apply — highlighted rows count in totals.';
  }
  return 'Single month view with daily attendance breakdown.';
}

export function periodSheetTitle(
  view: AttendancePeriodView,
  year: number,
  monthLabel: string,
  selectedMonths: number[],
): string {
  if (view === 'yearly') return `Yearly Summary — ${year}`;
  if (view === 'custom') {
    return `Selected Months — ${formatSelectedMonthsShort(selectedMonths)} ${year}`;
  }
  return `Monthly Summary — ${monthLabel}`;
}

export function monthChipLabel(monthIndex: number): string {
  return MONTHS_SHORT[monthIndex - 1];
}

export function monthFullLabel(monthIndex: number): string {
  return MONTHS[monthIndex - 1];
}
