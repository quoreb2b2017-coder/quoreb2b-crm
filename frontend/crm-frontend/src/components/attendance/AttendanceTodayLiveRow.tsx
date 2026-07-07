'use client';

import { memo } from 'react';
import type { AttendanceDailyRow } from '@/components/attendance/AttendanceDailyExcelGrid';
import {
  mergeTodayLiveRow,
  useTodayAttendanceTimer,
} from '@/hooks/useLiveAttendanceRows';

/** Subscribes to 1s timer — only mount for today's row. */
export const AttendanceTodayLiveRow = memo(function AttendanceTodayLiveRow({
  baseRow,
  enabled,
  children,
}: {
  baseRow: AttendanceDailyRow;
  enabled: boolean;
  children: (row: AttendanceDailyRow, live: { liveSeconds: number; isRunning: boolean }) => React.ReactNode;
}) {
  const timer = useTodayAttendanceTimer(enabled);
  const row = timer.isLiveDuty ? mergeTodayLiveRow(baseRow, timer) : baseRow;
  return (
    <>
      {children(row, {
        liveSeconds: timer.sessionLive ? timer.liveSeconds : 0,
        isRunning: timer.sessionLive,
      })}
    </>
  );
});
