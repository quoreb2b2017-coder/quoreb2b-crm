import type { AttendanceAnalytics } from '@/lib/api/attendance.service';
import type { WorkTimeMe } from '@/lib/api/work-time.service';
import { formatDurationFromMinutes } from '@/lib/api/work-time.service';
import {
  isDailyGrossQuotaMet,
  isDailyNetQuotaMet,
} from '@/lib/attendance/net-work-minutes';

/** Overlay session work-time (employee dashboard source) onto admin monthly rows. */
export function mergeWorkTimeIntoMonthlyAnalytics(
  monthly: AttendanceAnalytics,
  workTime: WorkTimeMe | null | undefined,
): AttendanceAnalytics {
  if (!workTime?.dailyBreakdown?.length) return monthly;

  const byDate = new Map(
    workTime.dailyBreakdown.map((d) => [d.date, d]),
  );

  return {
    ...monthly,
    dailyBreakdown: monthly.dailyBreakdown.map((row) => {
      const dateKey = row.date.slice(0, 10);
      const wt = byDate.get(dateKey);
      if (!wt) return row;

      const gross = wt.grossMinutes ?? 0;
      const net = wt.totalMinutes ?? 0;
      const breaks = wt.breakMinutes ?? row.breakMinutes ?? 0;

      return {
        ...row,
        grossWorkDurationMinutes: gross,
        grossWorkDurationFormatted: formatDurationFromMinutes(gross),
        workDurationMinutes: net,
        workDurationFormatted: formatDurationFromMinutes(net),
        breakMinutes: breaks,
        hoursWorked: Math.round((net / 60) * 100) / 100,
        dailyGrossTargetMet: isDailyGrossQuotaMet(gross),
        dailyTargetMet: wt.dailyTargetMet ?? isDailyNetQuotaMet(net),
      };
    }),
  };
}
