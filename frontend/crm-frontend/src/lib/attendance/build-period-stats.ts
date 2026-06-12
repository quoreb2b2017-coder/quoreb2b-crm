import type { AttendanceAnalytics } from '@/lib/api/attendance.service';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';

interface RollupTotals {
  present: number;
  absent: number;
  leave: number;
  half: number;
  avgPct: number;
  monthCount: number;
}

type StatTone = 'green' | 'red' | 'blue' | 'neutral';

export interface AttendancePeriodStat {
  label: string;
  value: string | number;
  tone: StatTone;
  checkHistoryHref?: string;
}

export function buildAttendancePeriodStats(
  view: AttendancePeriodView,
  monthlyData: AttendanceAnalytics | null,
  rollupTotals: RollupTotals,
  opts?: { checkHistoryHref?: string; yearlyHistoryHref?: string },
): AttendancePeriodStat[] | undefined {
  if (view === 'monthly' && monthlyData) {
    return [
      {
        label: 'Present',
        value: monthlyData.presentDays,
        tone: 'green',
        checkHistoryHref: opts?.checkHistoryHref,
      },
      { label: 'Absent', value: monthlyData.absentDays, tone: 'red' },
      { label: 'Leave', value: monthlyData.leaveDays, tone: 'blue' },
      { label: 'Attendance %', value: `${monthlyData.attendancePercentage}%`, tone: 'neutral' },
    ];
  }

  if (view === 'yearly' || view === 'custom') {
    const monthNote =
      view === 'yearly'
        ? '12 mo.'
        : rollupTotals.monthCount === 1
          ? '1 mo.'
          : `${rollupTotals.monthCount} mo.`;
    const presentLabel =
      view === 'yearly' ? `Year present (${monthNote})` : `Selected present (${monthNote})`;
    return [
      {
        label: presentLabel,
        value: rollupTotals.present,
        tone: 'green',
        checkHistoryHref:
          view === 'yearly' ? opts?.yearlyHistoryHref : opts?.checkHistoryHref,
      },
      {
        label: view === 'yearly' ? 'Year absent' : 'Selected absent',
        value: rollupTotals.absent,
        tone: 'red',
      },
      {
        label: view === 'yearly' ? 'Year leave' : 'Selected leave',
        value: rollupTotals.leave,
        tone: 'blue',
      },
      {
        label: view === 'yearly' ? 'Year avg %' : 'Selected avg %',
        value: `${rollupTotals.avgPct}%`,
        tone: 'neutral',
      },
    ];
  }

  return undefined;
}
