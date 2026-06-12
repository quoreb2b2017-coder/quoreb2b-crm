export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function monthLabel(month: number): string {
  if (month >= 1 && month <= 12) return MONTH_LABELS[month - 1];
  return 'Unknown';
}

/** CRM filing calendar — US Eastern (EDT/EST) */
export const BATCH_CALENDAR_TIMEZONE = 'America/New_York';

export function periodFromDate(date: Date = new Date()): { batchMonth: number; batchYear: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BATCH_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const batchYear = Number(parts.find((p) => p.type === 'year')?.value ?? date.getFullYear());
  const batchMonth = Number(parts.find((p) => p.type === 'month')?.value ?? date.getMonth() + 1);
  return { batchMonth, batchYear };
}

export function currentPeriod(): { batchMonth: number; batchYear: number } {
  return periodFromDate(new Date());
}

export function resolveBatchPeriod(doc: {
  batchMonth?: number;
  batchYear?: number;
  createdAt?: Date | string;
}): { batchMonth: number; batchYear: number } {
  if (
    typeof doc.batchMonth === 'number' &&
    doc.batchMonth >= 1 &&
    doc.batchMonth <= 12 &&
    typeof doc.batchYear === 'number'
  ) {
    return { batchMonth: doc.batchMonth, batchYear: doc.batchYear };
  }
  const created = doc.createdAt ? new Date(doc.createdAt) : new Date();
  return periodFromDate(created);
}
