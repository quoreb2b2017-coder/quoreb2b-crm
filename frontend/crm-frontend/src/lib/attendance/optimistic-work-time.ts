import type { WorkTimeMe } from '@/lib/api/work-time.service';
import { formatDurationFromMinutes, formatElapsedSeconds } from '@/lib/api/work-time.service';
import type { StashedLoginPunch } from '@/lib/auth/login-punch';
import { DAILY_NET_WORK_TARGET_MINUTES } from '@/lib/attendance/attendance-shift.constants';
import { computeNetWorkMinutes } from '@/lib/attendance/net-work-minutes';
import { grossMinutesFromElapsedSeconds } from '@/lib/attendance/live-punch-time';
import { todayDateKeyIst } from '@/lib/attendance/ist-date';
import { readTodayWorkGross } from '@/lib/attendance/today-work-cache';

/** Optimistic timer after login — new session starts now; prior same-day sessions stay counted. */
export function buildOptimisticWorkTimeFromLoginPunch(
  punch: StashedLoginPunch,
  prev: WorkTimeMe | null,
): WorkTimeMe {
  const now = new Date();
  const sessionLoginAt = now.toISOString();
  const elapsedSeconds = 0;
  const breakMinutes = prev?.todayBreakMinutes ?? 0;
  const todayKey = todayDateKeyIst(now);

  const prevSessionGross = prev?.currentSession?.elapsedSeconds
    ? grossMinutesFromElapsedSeconds(prev.currentSession.elapsedSeconds)
    : 0;

  const completedTodayGross =
    punch.workTimeTodayGrossMinutes ??
    (prev != null
      ? prev.isTimerRunning
        ? Math.max(0, (prev.todayGrossMinutes ?? 0) - prevSessionGross)
        : (prev.todayGrossMinutes ?? 0)
      : (readTodayWorkGross(todayKey) ?? 0));

  const todayGrossMinutes = completedTodayGross;
  const todayMinutes = computeNetWorkMinutes(todayGrossMinutes, breakMinutes);
  const prevMonthly = prev?.monthlyMinutes ?? 0;
  const prevTodayNet = prev?.todayMinutes ?? 0;
  const monthlyMinutes = Math.max(0, prevMonthly - prevTodayNet + todayMinutes);

  return {
    period: prev?.period ?? {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    },
    monthlyMinutes,
    monthlyFormatted: formatDurationFromMinutes(monthlyMinutes),
    todayMinutes,
    todayFormatted: formatDurationFromMinutes(todayMinutes),
    todayGrossMinutes,
    todayBreakMinutes: breakMinutes,
    dailyTargetMinutes: prev?.dailyTargetMinutes ?? DAILY_NET_WORK_TARGET_MINUTES,
    dailyBreakdown: prev?.dailyBreakdown?.length
      ? prev.dailyBreakdown.map((row) =>
          row.isToday || row.date === todayKey
            ? {
                ...row,
                totalMinutes: todayMinutes,
                totalFormatted: formatDurationFromMinutes(todayMinutes),
                grossMinutes: todayGrossMinutes,
                breakMinutes,
                dailyTargetMet: todayMinutes >= DAILY_NET_WORK_TARGET_MINUTES,
                isToday: true,
              }
            : row,
        )
      : [
          {
            date: todayKey,
            dayLabel: 'Today',
            totalMinutes: todayMinutes,
            totalFormatted: formatDurationFromMinutes(todayMinutes),
            grossMinutes: todayGrossMinutes,
            breakMinutes,
            dailyTargetMet: todayMinutes >= DAILY_NET_WORK_TARGET_MINUTES,
            isToday: true,
          },
        ],
    isTimerRunning: true,
    currentSession: {
      sessionId: punch.sessionId ?? 'login',
      loginAt: sessionLoginAt,
      elapsedSeconds,
      elapsedFormatted: formatElapsedSeconds(elapsedSeconds),
      isActive: true,
    },
  };
}
