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

function enrichHistoricalRow(row: AttendanceDailyRow): AttendanceDailyRow {
  const gross = row.grossWorkDurationMinutes ?? resolveGrossFromRow(row);
  const net = row.workDurationMinutes ?? computeNetWorkMinutes(gross, row.breakMinutes ?? 0);
  return {
    ...row,
    grossWorkDurationMinutes: gross,
    workDurationMinutes: net,
    breakMinutes: row.breakMinutes ?? resolveEffectiveBreakMinutes(gross, row.breakMinutes ?? 0),
    dailyGrossTargetMet: row.dailyGrossTargetMet ?? isDailyGrossQuotaMet(gross),
    dailyTargetMet: row.dailyTargetMet ?? isDailyNetQuotaMet(net),
  };
}

/** Historical rows only — stable across 1s timer ticks. */
export function useHistoricalAttendanceRows(rows: AttendanceDailyRow[], enabled = false) {
  const todayKey = useMemo(() => todayDateKeyIst(), []);
  return useMemo(() => {
    if (!enabled) return rows;
    return rows.map((row) => {
      const dateKey = row.date?.slice(0, 10);
      if (!dateKey || dateKey === todayKey) return row;
      return enrichHistoricalRow(row);
    });
  }, [rows, enabled, todayKey]);
}

/** Live timer state — isolated so only today's row re-renders each second. */
export function useTodayAttendanceTimer(enabled = false) {
  const {
    onBreak,
    isLiveDuty,
    todayLiveGrossMinutes,
    todayLiveMinutes,
    todayLiveFormatted,
    liveSeconds,
    workBreakMinutesLive,
    data,
  } = useWorkTimer(enabled);

  return {
    onBreak,
    isLiveDuty,
    todayLiveGrossMinutes,
    todayLiveMinutes,
    todayLiveFormatted,
    liveSeconds,
    workBreakMinutesLive,
    todayBreakMinutes: data?.todayBreakMinutes,
    sessionLive: Boolean(enabled && isLiveDuty),
  };
}

export function mergeTodayLiveRow(
  row: AttendanceDailyRow,
  timer: ReturnType<typeof useTodayAttendanceTimer>,
): AttendanceDailyRow {
  const workBreaks = timer.workBreakMinutesLive || timer.todayBreakMinutes || 0;
  const gross = timer.todayLiveGrossMinutes;
  const net = timer.todayLiveMinutes;
  return {
    ...row,
    grossWorkDurationMinutes: gross,
    workDurationMinutes: net,
    breakMinutes: resolveEffectiveBreakMinutes(gross, workBreaks || row.breakMinutes || 0),
    dailyGrossTargetMet: isDailyGrossQuotaMet(gross),
    dailyTargetMet: isDailyNetQuotaMet(net),
  };
}

/** @deprecated Prefer useHistoricalAttendanceRows + useTodayAttendanceTimer for render isolation. */
export function useLiveAttendanceRows(rows: AttendanceDailyRow[], enabled = false) {
  const historicalRows = useHistoricalAttendanceRows(rows, enabled);
  const timer = useTodayAttendanceTimer(enabled);
  const todayKey = useMemo(() => todayDateKeyIst(), []);

  const liveRows = useMemo(() => {
    if (!enabled) return rows;
    return historicalRows.map((row) => {
      const dateKey = row.date?.slice(0, 10);
      const isTodayLive = Boolean(dateKey) && dateKey === todayKey && Boolean(timer.isLiveDuty);
      if (!isTodayLive) return row;
      return mergeTodayLiveRow(row, timer);
    });
  }, [rows, enabled, historicalRows, todayKey, timer.isLiveDuty, timer.todayLiveGrossMinutes, timer.todayLiveMinutes, timer.workBreakMinutesLive, timer.todayBreakMinutes]);

  return {
    rows: liveRows,
    liveSeconds: timer.sessionLive ? timer.liveSeconds : 0,
    isRunning: timer.sessionLive,
    onBreak: enabled && timer.onBreak,
    todayLiveFormatted: enabled ? timer.todayLiveFormatted : undefined,
  };
}
