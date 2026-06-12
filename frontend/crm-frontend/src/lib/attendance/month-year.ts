export const MONTHS = [
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

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function formatMonthYearLabel(month: number, year: number, short = false): string {
  const names = short ? MONTHS_SHORT : MONTHS;
  return `${names[month - 1]} ${year}`;
}

/** Move month by ±1; rolls year at Jan/Dec boundaries. */
export function shiftMonth(
  year: number,
  month: number,
  delta: -1 | 1,
): { year: number; month: number } {
  let nextMonth = month + delta;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  } else if (nextMonth < 1) {
    nextMonth = 12;
    nextYear -= 1;
  }
  return { year: nextYear, month: nextMonth };
}

/** Year list that always includes the selected year and spans past/future. */
export function buildYearOptions(selectedYear: number, past = 10, future = 2): number[] {
  const current = new Date().getFullYear();
  const start = Math.min(current - past, selectedYear - 1);
  const end = Math.max(current + future, selectedYear + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
