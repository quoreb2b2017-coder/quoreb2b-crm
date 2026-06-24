import { calendarDateKey } from '../../common/utils/timezone.util';
import {
  buildAuthBoundaryForDay,
  buildWorkTimeSnapshot,
  type ActivityLogRow,
} from '../activity-logs/employee-report.util';
import {
  attendanceRecordForGrossLogin,
  computeNetWorkMinutes,
  resolveGrossLoginMinutes,
  type AttendanceRecordLike,
  type BreakSessionLike,
} from './attendance-work-time.util';

export interface DayWorkMetrics {
  grossMinutes: number;
  netMinutes: number;
  breakMinutes: number;
}

export interface BuildSessionWorkMetricsInput {
  logs: ActivityLogRow[];
  periodEnd: Date;
  sessionId?: string;
  todayAttRecord?: AttendanceRecordLike | null;
  onBreak: boolean;
  todayWorkBreakMinutesLive: number;
  attendanceBreakByDate: Map<string, number>;
  breakSessionsByDate: Map<string, BreakSessionLike[]>;
}

/** Single source of truth for per-day gross/net — same rules as employee work-time/me. */
export function buildSessionWorkMetricsByDay(
  input: BuildSessionWorkMetricsInput,
): Map<string, DayWorkMetrics> {
  const sessionSnap = buildWorkTimeSnapshot(input.logs, {
    sessionId: input.sessionId,
    periodEnd: input.periodEnd,
  });

  const todayDateKey =
    sessionSnap.dailyBreakdown.find((d) => d.isToday)?.date ??
    calendarDateKey(input.periodEnd);

  const todayBreakMinutes = input.attendanceBreakByDate.get(todayDateKey) ?? 0;
  const breaksForLiveNet =
    input.todayWorkBreakMinutesLive > 0
      ? input.todayWorkBreakMinutesLive
      : todayBreakMinutes;

  const todayAuth = buildAuthBoundaryForDay(
    input.logs,
    todayDateKey,
    input.periodEnd,
    input.sessionId,
  );

  const grossAttendanceRecord = attendanceRecordForGrossLogin(
    input.todayAttRecord ?? undefined,
    todayAuth.firstLoginAt,
  );

  const todayBreakSessions = input.breakSessionsByDate.get(todayDateKey) ?? [];
  const result = new Map<string, DayWorkMetrics>();

  for (const day of sessionSnap.dailyBreakdown) {
    const breakMinutes = input.attendanceBreakByDate.get(day.date) ?? 0;
    const grossMinutes = resolveGrossLoginMinutes(
      day.totalMinutes,
      day.isToday ? grossAttendanceRecord : undefined,
      day.date,
      input.periodEnd,
      day.isToday
        ? {
            onDuty:
              input.todayAttRecord?.checkOutTime && !input.onBreak
                ? false
                : todayAuth.onDuty,
            activeBreak: input.onBreak,
            breakSessions: todayBreakSessions,
          }
        : {
            breakSessions: input.breakSessionsByDate.get(day.date) ?? [],
          },
    );
    const breakMinutesForDay = day.isToday ? breaksForLiveNet : breakMinutes;
    const netMinutes = computeNetWorkMinutes(grossMinutes, breakMinutesForDay);
    result.set(day.date, {
      grossMinutes,
      netMinutes,
      breakMinutes: breakMinutesForDay,
    });
  }

  return result;
}
