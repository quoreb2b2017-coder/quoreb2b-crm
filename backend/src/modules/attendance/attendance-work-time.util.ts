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

/** Use punched tea/lunch breaks for net work; meeting time is not deducted. */
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
  allowLiveToday = true,
): number {
  if (!record) return 0;

  const isToday = dateKey === todayDateKey();

  if (record.checkInTime && record.checkOutTime) {
    const ms = record.checkOutTime.getTime() - record.checkInTime.getTime();
    return Math.min(MAX_MINUTES_PER_DAY, Math.max(0, Math.round(ms / 60000)));
  }

  if (
    allowLiveToday &&
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

/** Attendance row with auth first-login fallback for gross login span. */
export function attendanceRecordForGrossLogin(
  record: AttendanceRecordLike | undefined,
  firstLoginAt: Date | null | undefined,
): AttendanceRecordLike | undefined {
  if (record?.checkInTime) return record;
  if (!firstLoginAt) return record;
  return {
    date: record?.date ?? new Date(),
    status: record?.status ?? 'present',
    checkInTime: firstLoginAt,
    checkOutTime: record?.checkOutTime,
  };
}

/** Break types that keep gross login time running after logout until the break ends. */
export const LOGOUT_CONTINUING_BREAK_TYPES = new Set(['tea', 'lunch', 'meeting']);

export interface BreakSessionLike {
  startedAt: Date;
  endedAt?: Date | null;
  type?: string;
}

/**
 * Gross login spans first check-in → now (on duty), checkout (off duty),
 * or through tea/lunch/approved meeting — paused on logout otherwise.
 */
export interface GrossLoginOptions {
  onDuty?: boolean;
  activeBreak?: boolean;
  punchedBreakMinutes?: number;
  breakSessions?: BreakSessionLike[];
}

/** End instant for gross login span — live clock ONLY while on duty or active break. */
export function resolveGrossLoginEndMs(
  periodEnd: Date,
  onDuty: boolean,
  activeBreak: boolean,
  checkOutTime?: Date | null,
  breakSessions: BreakSessionLike[] = [],
): number {
  const now = periodEnd.getTime();
  if (onDuty || activeBreak) return now;

  if (!checkOutTime) return 0;

  let endMs = checkOutTime.getTime();
  const checkoutMs = endMs;

  for (const session of breakSessions) {
    if (session.type && !LOGOUT_CONTINUING_BREAK_TYPES.has(session.type)) continue;
    const startMs = new Date(session.startedAt).getTime();
    if (startMs > checkoutMs) continue;
    if (!session.endedAt) continue;
    const sessionEndMs = new Date(session.endedAt).getTime();
    if (sessionEndMs > endMs) {
      endMs = sessionEndMs;
    }
  }
  return endMs;
}

export function resolveGrossLoginMinutes(
  sessionGrossMinutes: number,
  record: AttendanceRecordLike | undefined,
  dateKey: string,
  periodEnd: Date,
  opts: GrossLoginOptions = {},
): number {
  if (!record?.checkInTime || dateKey !== todayDateKey()) {
    return sessionGrossMinutes;
  }

  const onDuty =
    opts.onDuty !== undefined ? opts.onDuty : isOnDutyRecord(record, dateKey);
  const activeBreak = opts.activeBreak ?? false;

  if (!onDuty && !activeBreak) {
    const endMs = resolveGrossLoginEndMs(
      periodEnd,
      false,
      false,
      record.checkOutTime,
      opts.breakSessions ?? [],
    );
    if (endMs <= 0) return sessionGrossMinutes;
    const checkoutMs = record.checkOutTime?.getTime() ?? 0;
    if (!checkoutMs || endMs <= checkoutMs) {
      return sessionGrossMinutes;
    }
    const inMs = attendanceStoredInstantMs(record.checkInTime, endMs);
    const spanMinutes = Math.min(
      MAX_MINUTES_PER_DAY,
      Math.max(0, Math.round((endMs - inMs) / 60000)),
    );
    return Math.max(sessionGrossMinutes, spanMinutes);
  }

  const endMs = resolveGrossLoginEndMs(
    periodEnd,
    onDuty,
    activeBreak,
    record.checkOutTime,
    opts.breakSessions ?? [],
  );

  const inMs = attendanceStoredInstantMs(record.checkInTime, endMs);
  const spanMinutes = Math.min(
    MAX_MINUTES_PER_DAY,
    Math.max(0, Math.round((endMs - inMs) / 60000)),
  );
  return Math.max(sessionGrossMinutes, spanMinutes);
}

/** @deprecated Use resolveGrossLoginMinutes */
export function extendGrossForContinuingBreak(
  sessionGrossMinutes: number,
  record: AttendanceRecordLike | undefined,
  dateKey: string,
  periodEnd: Date,
  hasActiveBreak: boolean,
): number {
  return resolveGrossLoginMinutes(sessionGrossMinutes, record, dateKey, periodEnd, {
    activeBreak: hasActiveBreak,
  });
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
  workBreakMinutesByDate: Map<string, number> = new Map(),
  hasActiveBreakToday = false,
  allBreakMinutesByDate?: Map<string, number>,
  breakSessionsByDate: Map<string, BreakSessionLike[]> = new Map(),
): AttendanceWorkTimeSnapshot {
  const todayKey = todayDateKey();
  const allBreaks = allBreakMinutesByDate ?? workBreakMinutesByDate;
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
    const rawGross = computeDayWorkMinutes(
      record,
      dateKey,
      periodEnd,
      isOnDutyRecord(record, dateKey),
    );
    const workBreaks = workBreakMinutesByDate.get(dateKey) ?? 0;
    const allBreakMins = allBreaks.get(dateKey) ?? 0;
    const gross = resolveGrossLoginMinutes(rawGross, record, dateKey, periodEnd, {
      onDuty: isOnDutyRecord(record, dateKey),
      activeBreak: hasActiveBreakToday && dateKey === todayKey,
      punchedBreakMinutes: allBreakMins,
      breakSessions: breakSessionsByDate.get(dateKey) ?? [],
    });
    const net = computeNetWorkMinutes(gross, workBreaks);
    grossByDay.set(dateKey, gross);
    breakByDay.set(dateKey, workBreaks);
    if (net > 0 || gross > 0 || dateKey === todayKey) {
      dayTotals.set(dateKey, net);
    }
    if (dateKey === todayKey) todayRecord = record;
  }

  if (!dayTotals.has(todayKey)) {
    const rawGross = computeDayWorkMinutes(
      todayRecord,
      todayKey,
      periodEnd,
      isOnDutyRecord(todayRecord, todayKey),
    );
    const workBreaks = workBreakMinutesByDate.get(todayKey) ?? 0;
    const allBreakMins = allBreaks.get(todayKey) ?? 0;
    const gross = resolveGrossLoginMinutes(rawGross, todayRecord, todayKey, periodEnd, {
      onDuty: isOnDutyRecord(todayRecord, todayKey),
      activeBreak: hasActiveBreakToday,
      punchedBreakMinutes: allBreakMins,
      breakSessions: breakSessionsByDate.get(todayKey) ?? [],
    });
    grossByDay.set(todayKey, gross);
    breakByDay.set(todayKey, workBreaks);
    dayTotals.set(todayKey, computeNetWorkMinutes(gross, workBreaks));
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
