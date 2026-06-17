import type { BatchRecord } from '@/lib/api/batches.service';

export interface CalendarMonth {
  index: number;
  label: string;
  short: string;
  accent: string;
  accentBg: string;
  border: string;
}

export const CALENDAR_MONTHS: CalendarMonth[] = [
  { index: 1, label: 'January', short: 'Jan', accent: 'text-sky-700', accentBg: 'bg-sky-50', border: 'border-sky-200' },
  { index: 2, label: 'February', short: 'Feb', accent: 'text-violet-700', accentBg: 'bg-violet-50', border: 'border-violet-200' },
  { index: 3, label: 'March', short: 'Mar', accent: 'text-indigo-700', accentBg: 'bg-indigo-50', border: 'border-indigo-200' },
  { index: 4, label: 'April', short: 'Apr', accent: 'text-emerald-700', accentBg: 'bg-emerald-50', border: 'border-emerald-200' },
  { index: 5, label: 'May', short: 'May', accent: 'text-lime-700', accentBg: 'bg-lime-50', border: 'border-lime-200' },
  { index: 6, label: 'June', short: 'Jun', accent: 'text-amber-700', accentBg: 'bg-amber-50', border: 'border-amber-200' },
  { index: 7, label: 'July', short: 'Jul', accent: 'text-orange-700', accentBg: 'bg-orange-50', border: 'border-orange-200' },
  { index: 8, label: 'August', short: 'Aug', accent: 'text-rose-700', accentBg: 'bg-rose-50', border: 'border-rose-200' },
  { index: 9, label: 'September', short: 'Sep', accent: 'text-fuchsia-700', accentBg: 'bg-fuchsia-50', border: 'border-fuchsia-200' },
  { index: 10, label: 'October', short: 'Oct', accent: 'text-cyan-700', accentBg: 'bg-cyan-50', border: 'border-cyan-200' },
  { index: 11, label: 'November', short: 'Nov', accent: 'text-teal-700', accentBg: 'bg-teal-50', border: 'border-teal-200' },
  { index: 12, label: 'December', short: 'Dec', accent: 'text-blue-700', accentBg: 'bg-blue-50', border: 'border-blue-200' },
];

export const BATCH_CALENDAR_TIMEZONE = 'America/New_York';

export function calendarPeriodFromDate(date: Date = new Date()): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BATCH_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value ?? date.getFullYear()),
    month: Number(parts.find((p) => p.type === 'month')?.value ?? date.getMonth() + 1),
  };
}

export function currentCalendarPeriod(): { month: number; year: number } {
  return calendarPeriodFromDate(new Date());
}

export function resolveBatchPeriod(batch: BatchRecord): { month: number; year: number } {
  if (batch.batchMonth && batch.batchYear) {
    return { month: batch.batchMonth, year: batch.batchYear };
  }
  const d = batch.createdAt ? new Date(batch.createdAt) : new Date();
  return calendarPeriodFromDate(d);
}

const SAVED_YEARS_KEY = 'crm-batch-library-years';
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export function isValidLibraryYear(y: number): boolean {
  return Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR;
}

export function loadSavedLibraryYears(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_YEARS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((y): y is number => typeof y === 'number' && isValidLibraryYear(y));
  } catch {
    return [];
  }
}

export function persistSavedLibraryYears(years: number[]): void {
  if (typeof window === 'undefined') return;
  const valid = [...new Set(years.filter(isValidLibraryYear))].sort((a, b) => b - a);
  localStorage.setItem(SAVED_YEARS_KEY, JSON.stringify(valid));
}

/** Years from batches + user-added + current ±1 */
export function buildLibraryYears(batches: BatchRecord[], savedYears: number[]): number[] {
  const { year: now } = currentCalendarPeriod();
  const set = new Set<number>([now, now - 1, now + 1, ...savedYears]);
  for (const b of batches) {
    set.add(resolveBatchPeriod(b).year);
  }
  return Array.from(set)
    .filter(isValidLibraryYear)
    .sort((a, b) => b - a);
}

export function getAvailableYears(batches: BatchRecord[]): number[] {
  return buildLibraryYears(batches, loadSavedLibraryYears());
}

/** Selecting a year always exposes Jan–Dec (empty folders included). */
export function createEmptyMonthMap<T = BatchRecord[]>(): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (let m = 1; m <= 12; m++) map.set(m, []);
  return map;
}

export function groupBatchesByMonth(
  batches: BatchRecord[],
  year: number,
): Map<number, BatchRecord[]> {
  const map = createEmptyMonthMap();
  for (const b of batches) {
    const { month, year: y } = resolveBatchPeriod(b);
    if (y !== year) continue;
    map.get(month)!.push(b);
  }
  map.forEach((list) => {
    list.sort((a: BatchRecord, b: BatchRecord) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  });
  return map;
}

/** Current year → always open current month folder; other years → latest month with folders */
export function pickDefaultMonth(
  map: Map<number, { length: number }[] | unknown[]>,
  year: number = currentCalendarPeriod().year,
): number {
  const { month: currentMonth, year: currentYear } = currentCalendarPeriod();
  if (year === currentYear) return currentMonth;
  for (let m = 12; m >= 1; m--) {
    if ((map.get(m)?.length ?? 0) > 0) return m;
  }
  return currentMonth;
}
