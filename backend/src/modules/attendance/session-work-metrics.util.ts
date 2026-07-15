import { calendarDateKey } from '../../common/utils/timezone.util';
import {
  buildAuthBoundaryForDay,
  buildDailyWorkBreakdown,
  buildSessions,
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
  const sessions = buildSessions(input.logs, input.periodEnd, {
    activeSessionId: input.sessionId,
  });
  // Full month of days (no UI truncate) so monthly totals stay accurate.
  const allDays = buildDailyWorkBreakdown(sessions, input.periodEnd);

  const todayDateKey =
    allDays.find((d) => d.isToday)?.date ?? calendarDateKey(input.periodEnd);

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

  for (const day of allDays) {
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
