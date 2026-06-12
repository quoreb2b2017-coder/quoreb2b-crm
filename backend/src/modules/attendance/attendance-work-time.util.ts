import { attendanceStoredInstantMs, toDateKey } from './attendance-date.util';
import {
  formatStoredTime,
  formatTime12h,
  todayDateKey,
} from './attendance-late.util';
import {
  DAILY_GROSS_TARGET_MINUTES,
  DAILY_NET_WORK_TARGET_MINUTES,
  SCHEDULED_SHIFT_BREAK_MINUTES,
} from './attendance-shift.constants';
import {
  formatDuration,
  formatElapsedSeconds,
} from '../activity-logs/employee-report.util';
import { formatInWorkspace } from '../../common/utils/timezone.util';

export interface AttendanceRecordLike {
  date: Date;
  status: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  hoursWorked?: number;
}

const MAX_MINUTES_PER_DAY = 24 * 60;
const MAX_DAILY_ROWS = 14;

/** Use punched breaks when logged; else standard 75m off a full 9h shift. */
export function resolveEffectiveBreakMinutes(
  grossMinutes: number,
  punchedBreakMinutes: number,
): number {
  if (grossMinutes <= 0) return 0;
  if (punchedBreakMinutes > 0) {
    return Math.min(grossMinutes, punchedBreakMinutes);
  }
  if (grossMinutes >= DAILY_GROSS_TARGET_MINUTES) {
    return Math.min(grossMinutes, SCHEDULED_SHIFT_BREAK_MINUTES);
  }
  return 0;
}

export function computeNetWorkMinutes(grossMinutes: number, punchedBreakMinutes: number): number {
  const effectiveBreaks = resolveEffectiveBreakMinutes(grossMinutes, punchedBreakMinutes);
  return Math.min(
    MAX_MINUTES_PER_DAY,
    Math.max(0, Math.round(grossMinutes - effectiveBreaks)),
  );
}

export function isDailyWorkQuotaMet(netMinutes: number): boolean {
  return netMinutes >= DAILY_NET_WORK_TARGET_MINUTES;
}

export function isDailyGrossQuotaMet(grossMinutes: number): boolean {
  return grossMinutes >= DAILY_GROSS_TARGET_MINUTES;
}

export function computeDayWorkMinutes(
  record: AttendanceRecordLike | undefined,
  dateKey: string,
  periodEnd: Date,
): number {
  if (!record) return 0;

  const isToday = dateKey === todayDateKey();

  if (record.checkInTime && record.checkOutTime) {
    const ms = record.checkOutTime.getTime() - record.checkInTime.getTime();
    return Math.min(MAX_MINUTES_PER_DAY, Math.max(0, Math.round(ms / 60000)));
  }

  if (
    record.checkInTime &&
    !record.checkOutTime &&
    isToday &&
    (record.status === 'present' || record.status === 'half-day')
  ) {
    const endMs = periodEnd.getTime();
    const inMs = attendanceStoredInstantMs(record.checkInTime, endMs);
    const ms = endMs - inMs;
    return Math.min(MAX_MINUTES_PER_DAY, Math.max(0, Math.round(ms / 60000)));
  }

  if (record.hoursWorked && record.hoursWorked > 0) {
    return Math.min(MAX_MINUTES_PER_DAY, Math.round(record.hoursWorked * 60));
  }

  return 0;
}

export function isOnDutyRecord(
  record: AttendanceRecordLike | undefined,
  dateKey: string,
): boolean {
  if (dateKey !== todayDateKey()) return false;
  return (
    (record?.status === 'present' || record?.status === 'half-day') &&
    !!record?.checkInTime &&
    !record?.checkOutTime
  );
}

export interface AttendanceWorkTimeSnapshot {
  period: { year: number; month: number; label: string };
  monthlyMinutes: number;
  monthlyFormatted: string;
  todayMinutes: number;
  todayFormatted: string;
  todayGrossMinutes: number;
  todayBreakMinutes: number;
  dailyTargetMinutes: number;
  dailyBreakdown: Array<{
    date: string;
    dayLabel: string;
    totalMinutes: number;
    totalFormatted: string;
    grossMinutes: number;
    breakMinutes: number;
    dailyTargetMet: boolean;
    isToday: boolean;
  }>;
  isOnDuty: boolean;
  activePunch: {
    punchInAt: string;
    elapsedSeconds: number;
    elapsedFormatted: string;
  } | null;
}

export function buildAttendanceWorkTimeSnapshot(
  records: AttendanceRecordLike[],
  year: number,
  month: number,
  periodEnd: Date = new Date(),
  breakMinutesByDate: Map<string, number> = new Map(),
): AttendanceWorkTimeSnapshot {
  const todayKey = todayDateKey();
  const label = formatInWorkspace(new Date(year, month - 1, 1), {
    month: 'long',
    year: 'numeric',
  });

  const byDay = new Map<string, AttendanceRecordLike>();
  for (const r of records) {
    byDay.set(toDateKey(new Date(r.date)), r);
  }

  const dayTotals = new Map<string, number>();
  let todayRecord: AttendanceRecordLike | undefined;

  const grossByDay = new Map<string, number>();
  const breakByDay = new Map<string, number>();

  for (const [dateKey, record] of byDay.entries()) {
    const gross = computeDayWorkMinutes(record, dateKey, periodEnd);
    const breaks = breakMinutesByDate.get(dateKey) ?? 0;
    const net = computeNetWorkMinutes(gross, breaks);
    grossByDay.set(dateKey, gross);
    breakByDay.set(dateKey, breaks);
    if (net > 0 || gross > 0 || dateKey === todayKey) {
      dayTotals.set(dateKey, net);
    }
    if (dateKey === todayKey) todayRecord = record;
  }

  if (!dayTotals.has(todayKey)) {
    const gross = computeDayWorkMinutes(todayRecord, todayKey, periodEnd);
    const breaks = breakMinutesByDate.get(todayKey) ?? 0;
    grossByDay.set(todayKey, gross);
    breakByDay.set(todayKey, breaks);
    dayTotals.set(todayKey, computeNetWorkMinutes(gross, breaks));
  }

  const dailyBreakdown = [...dayTotals.entries()]
    .map(([date, totalMinutes]) => {
      const isToday = date === todayKey;
      const d = new Date(`${date}T12:00:00`);
      const grossMinutes = grossByDay.get(date) ?? 0;
      const breakMinutes = breakByDay.get(date) ?? 0;
      return {
        date,
        dayLabel: isToday
          ? 'Today'
          : formatInWorkspace(d, { weekday: 'short', day: 'numeric' }),
        totalMinutes,
        totalFormatted: formatDuration(totalMinutes),
        grossMinutes,
        breakMinutes,
        dailyTargetMet: isDailyWorkQuotaMet(totalMinutes),
        isToday,
      };
    })
    .filter((row) => row.totalMinutes > 0 || row.isToday)
    .sort((a, b) => {
      if (a.isToday) return -1;
      if (b.isToday) return 1;
      return b.date.localeCompare(a.date);
    })
    .slice(0, MAX_DAILY_ROWS);

  const monthlyMinutes = [...dayTotals.values()].reduce((s, m) => s + m, 0);
  const todayMinutes = dayTotals.get(todayKey) ?? 0;
  const todayGrossMinutes = grossByDay.get(todayKey) ?? 0;
  const todayBreakMinutes = breakByDay.get(todayKey) ?? 0;

  const onDuty = isOnDutyRecord(todayRecord, todayKey);
  let activePunch: AttendanceWorkTimeSnapshot['activePunch'] = null;
  if (onDuty && todayRecord?.checkInTime) {
    const endMs = periodEnd.getTime();
    const inMs = attendanceStoredInstantMs(todayRecord.checkInTime, endMs);
    const elapsedSeconds = Math.max(0, Math.floor((endMs - inMs) / 1000));
    activePunch = {
      punchInAt: todayRecord.checkInTime.toISOString(),
      elapsedSeconds,
      elapsedFormatted: formatElapsedSeconds(elapsedSeconds),
    };
  }

  return {
    period: { year, month, label },
    monthlyMinutes,
    monthlyFormatted: formatDuration(monthlyMinutes),
    todayMinutes,
    todayFormatted: formatDuration(todayMinutes),
    todayGrossMinutes,
    todayBreakMinutes,
    dailyTargetMinutes: DAILY_NET_WORK_TARGET_MINUTES,
    dailyBreakdown,
    isOnDuty: onDuty,
    activePunch,
  };
}

export function formatWorkDurationFromMinutes(minutes: number): string {
  return formatDuration(Math.min(MAX_MINUTES_PER_DAY, Math.max(0, Math.round(minutes))));
}

export function formatCheckInOut12h(date?: Date): string | undefined {
  if (!date) return undefined;
  return formatTime12h(formatStoredTime(date));
}
