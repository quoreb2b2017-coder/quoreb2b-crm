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



/** Merge dashboard session work time into today's daily-log row (same source as banner timer). */

export function useLiveAttendanceRows(rows: AttendanceDailyRow[], enabled = false) {

  const {

    isRunning,

    onBreak,

    todayLiveGrossMinutes,

    todayLiveMinutes,

    todayLiveFormatted,

    liveSeconds,

    data,

  } = useWorkTimer(enabled);



  const todayKey = useMemo(() => todayDateKeyIst(), []);



  const liveRows = useMemo(() => {

    if (!enabled) return rows;



    return rows.map((row) => {

      const dateKey = row.date.slice(0, 10);

      const punchedBreaks = row.breakMinutes ?? data?.todayBreakMinutes ?? 0;



      if (dateKey === todayKey && data) {
        const gross =
          isRunning ? todayLiveGrossMinutes : (data.todayGrossMinutes ?? 0);
        const net = isRunning ? todayLiveMinutes : (data.todayMinutes ?? 0);

        return {

          ...row,

          grossWorkDurationMinutes: gross,

          workDurationMinutes: net,

          breakMinutes: resolveEffectiveBreakMinutes(gross, punchedBreaks),

          dailyGrossTargetMet: isDailyGrossQuotaMet(gross),

          dailyTargetMet: isDailyNetQuotaMet(net),

        };

      }



      const gross = resolveGrossFromRow(row);

      const net = computeNetWorkMinutes(gross, punchedBreaks);

      return {

        ...row,

        grossWorkDurationMinutes: gross,

        workDurationMinutes: net,

        breakMinutes: resolveEffectiveBreakMinutes(gross, punchedBreaks),

        dailyGrossTargetMet: isDailyGrossQuotaMet(gross),

        dailyTargetMet: isDailyNetQuotaMet(net),

      };

    });

  }, [

    rows,

    enabled,

    todayKey,

    data,

    isRunning,

    todayLiveGrossMinutes,

    todayLiveMinutes,

  ]);



  return {

    rows: liveRows,

    liveSeconds: enabled && isRunning ? liveSeconds : 0,

    isRunning: enabled && isRunning,

    onBreak: enabled && onBreak,

    todayLiveFormatted: enabled ? todayLiveFormatted : undefined,

  };

}


