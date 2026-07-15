import { formatAttendanceStatusLabel } from '@/lib/attendance/late-attendance';
import {
  isWeekendDateKey,
  todayDateKey,
} from '@/lib/constants/workspace-timezone';

export type AttendanceCalendarStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'leave'
  | 'paid-leave'
  | 'holiday'
  | 'half-day'
  | 'weekend'
  | 'empty'
  | 'future'
  | 'outside';

export interface AttendanceDayCell {
  date: string;
  status: string;
  hoursWorked?: number;
  isPaidLeave?: boolean;
  isLate?: boolean;
  checkInTime?: string;
  notes?: string;
  workDurationMinutes?: number;
  dailyTargetMet?: boolean;
}

export const ATTENDANCE_STATUS_COLORS: Record<
  Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside'>,
  string
> = {
  present: '#16A34A',
  absent: '#EF4444',
  late: '#F59E0B',
  leave: '#3B82F6',
  'paid-leave': '#8B5CF6',
  /** Magenta — clearly separate from Present green */
  holiday: '#DB2777',
  'half-day': '#EAB308',
  weekend: '#94A3B8',
};

/** Soft cell backgrounds (dashboard calendar) */
export const ATTENDANCE_STATUS_BG: Record<
  Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside'>,
  string
> = {
  present: '#DCFCE7',
  absent: '#FEE2E2',
  late: '#FEF3C7',
  leave: '#DBEAFE',
  'paid-leave': '#EDE9FE',
  holiday: '#FCE7F3',
  'half-day': '#FEF9C3',
  weekend: '#F1F5F9',
};

export const ATTENDANCE_STATUS_TEXT: Record<
  Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside' | 'weekend'>,
  string
> = {
  present: '#15803D',
  absent: '#B91C1C',
  late: '#B45309',
  leave: '#1D4ED8',
  'paid-leave': '#6D28D9',
  holiday: '#9D174D',
  'half-day': '#A16207',
};

export const ATTENDANCE_LEGEND_ITEMS: Array<{
  status: Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside'>;
  label: string;
}> = [
  { status: 'present', label: 'Present' },
  { status: 'absent', label: 'Absent' },
  { status: 'late', label: 'Present (Late)' },
  { status: 'leave', label: 'Leave' },
  { status: 'paid-leave', label: 'Paid Leave' },
  { status: 'holiday', label: 'Holiday' },
  { status: 'half-day', label: 'Half Day' },
  { status: 'weekend', label: 'Weekend' },
];

export const DAILY_TARGET_LEGEND = {
  label: '7h 45m done',
  color: '#16A34A',
};

export const CALENDAR_GRID_ROWS = 6;
export const CALENDAR_GRID_COLS = 7;

/** Monday-first labels */
export const WEEKDAYS_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Sunday-first labels (dashboard minimal calendar) */
export const WEEKDAYS_SUN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function resolveCalendarStatus(day: AttendanceDayCell | undefined, dateKey: string): AttendanceCalendarStatus {
  const key = dateKey.slice(0, 10);
  const today = todayDateKey();
  if (key > today) return 'future';

  if (!day) {
    return isWeekendDateKey(key) ? 'weekend' : 'absent';
  }

  const notes = day.notes?.toLowerCase() ?? '';
  if (notes.includes('holiday') || notes.includes('public holiday') || notes.includes('federal')) {
    return 'holiday';
  }

  const status = day.status?.toLowerCase() ?? '';

  if (status === 'holiday') return 'holiday';
  if (day.isLate && (status === 'present' || status === 'half-day')) return 'late';
  if (status === 'weekend' && isWeekendDateKey(key)) return 'weekend';
  if (status === 'half-day') return 'half-day';
  if (status === 'leave') return day.isPaidLeave ? 'paid-leave' : 'leave';
  if (status === 'present') return 'present';
  if (status === 'absent') return 'absent';

  return isWeekendDateKey(key) ? 'weekend' : 'absent';
}

export function getStatusLabel(
  status: AttendanceCalendarStatus,
  day?: Pick<AttendanceDayCell, 'status' | 'isLate' | 'isPaidLeave'>,
): string {
  if (status === 'late' && day) {
    return formatAttendanceStatusLabel(day.status, true, day.isPaidLeave);
  }
  const item = ATTENDANCE_LEGEND_ITEMS.find((i) => i.status === status);
  if (item) return item.label;
  if (status === 'future') return 'Upcoming';
  if (status === 'outside') return '';
  return '—';
}

function dateKeyFrom(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type CalendarGridCell =
  | { type: 'outside'; day: number; dateKey: string; calendarStatus: AttendanceCalendarStatus }
  | {
      type: 'day';
      day: number;
      dateKey: string;
      record?: AttendanceDayCell;
      calendarStatus: AttendanceCalendarStatus;
    };

export function countHolidaysInBreakdown(dailyBreakdown: AttendanceDayCell[]): number {
  return dailyBreakdown.filter((d) => {
    const key = d.date.slice(0, 10);
    return resolveCalendarStatus(d, key) === 'holiday';
  }).length;
}

export function buildMonthCalendar(
  year: number,
  month: number,
  dailyBreakdown: AttendanceDayCell[],
  weekStart: 'sun' | 'mon' = 'mon',
) {
  const byDate = new Map(dailyBreakdown.map((d) => [d.date.slice(0, 10), d]));
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1);
  const startOffset =
    weekStart === 'sun' ? firstDay.getDay() : (firstDay.getDay() + 6) % 7;
  const weekdays = weekStart === 'sun' ? WEEKDAYS_SUN : WEEKDAYS_MON;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

  const cells: CalendarGridCell[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateKey = dateKeyFrom(prevYear, prevMonth, day);
    cells.push({
      type: 'outside',
      day,
      dateKey,
      calendarStatus: isWeekendDateKey(dateKey) ? 'weekend' : 'outside',
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = dateKeyFrom(year, month, day);
    const record = byDate.get(dateKey);
    cells.push({
      type: 'day',
      day,
      dateKey,
      record,
      calendarStatus: resolveCalendarStatus(record, dateKey),
    });
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let nextDay = 1;
  const gridSlots = CALENDAR_GRID_ROWS * CALENDAR_GRID_COLS;
  while (cells.length < gridSlots) {
    const dateKey = dateKeyFrom(nextYear, nextMonth, nextDay);
    cells.push({
      type: 'outside',
      day: nextDay,
      dateKey,
      calendarStatus: isWeekendDateKey(dateKey) ? 'weekend' : 'outside',
    });
    nextDay += 1;
  }

  return { weekdays, cells: cells.slice(0, gridSlots) };
}
