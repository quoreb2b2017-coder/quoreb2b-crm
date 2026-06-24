'use client';

import { useMemo } from 'react';
import type { AttendanceDailyRow } from '@/components/attendance/AttendanceDailyExcelGrid';
import { todayDateKeyIst } from '@/lib/attendance/ist-date';
import {
  computeNetWorkMinutes,
  isDailyGrossQuotaMet,
  isDailyNetQuotaMet,
  resolveEffectiveBreakMinutes,
} from '@/lib/attendance/net-work-minutes';
import { useWorkTimer } from '@/hooks/useWorkTimer';

function resolveGrossFromRow(day: AttendanceDailyRow): number {
  if (day.grossWorkDurationMinutes != null) return day.grossWorkDurationMinutes;
  if (day.workDurationMinutes != null && day.breakMinutes != null) {
    return day.workDurationMinutes + day.breakMinutes;
  }
  if (day.hoursWorked > 0) return Math.round(day.hoursWorked * 60);
  return 0;
}

/** Merge dashboard timer into today's row — Login (9h) gross vs Working (7h 45m) net. */
export function useLiveAttendanceRows(rows: AttendanceDailyRow[], enabled = false) {
  const {
    isRunning,
    onBreak,
    isLiveDuty,
    todayLiveGrossMinutes,
    todayLiveMinutes,
    todayLiveFormatted,
    liveSeconds,
    workBreakMinutesLive,
    data,
  } = useWorkTimer(enabled);

  const todayKey = useMemo(() => todayDateKeyIst(), []);

  const liveRows = useMemo(() => {
    if (!enabled) return rows;

    return rows.map((row) => {
      const dateKey = row.date.slice(0, 10);
      const isTodayLive = dateKey === todayKey && Boolean(isLiveDuty);

      if (isTodayLive) {
        const workBreaks =
          workBreakMinutesLive ||
          row.breakMinutes ||
          data?.todayBreakMinutes ||
          0;
        const gross = todayLiveGrossMinutes;
        const net = todayLiveMinutes;
        return {
          ...row,
          grossWorkDurationMinutes: gross,
          workDurationMinutes: net,
          breakMinutes: resolveEffectiveBreakMinutes(gross, workBreaks),
          dailyGrossTargetMet: isDailyGrossQuotaMet(gross),
          dailyTargetMet: isDailyNetQuotaMet(net),
        };
      }

      const gross =
        row.grossWorkDurationMinutes ??
        resolveGrossFromRow(row);
      const net =
        row.workDurationMinutes ??
        computeNetWorkMinutes(gross, row.breakMinutes ?? 0);
      return {
        ...row,
        grossWorkDurationMinutes: gross,
        workDurationMinutes: net,
        breakMinutes: row.breakMinutes ?? resolveEffectiveBreakMinutes(gross, row.breakMinutes ?? 0),
        dailyGrossTargetMet: row.dailyGrossTargetMet ?? isDailyGrossQuotaMet(gross),
        dailyTargetMet: row.dailyTargetMet ?? isDailyNetQuotaMet(net),
      };
    });
  }, [
    rows,
    enabled,
    todayKey,
    data,
    isLiveDuty,
    isRunning,
    onBreak,
    todayLiveGrossMinutes,
    todayLiveMinutes,
    workBreakMinutesLive,
  ]);

  const sessionLive = Boolean(enabled && isLiveDuty);

  return {
    rows: liveRows,
    liveSeconds: sessionLive ? liveSeconds : 0,
    isRunning: sessionLive,
    onBreak: enabled && onBreak,
    todayLiveFormatted: enabled ? todayLiveFormatted : undefined,
  };
}
