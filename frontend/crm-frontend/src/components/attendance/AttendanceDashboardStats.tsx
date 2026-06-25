'use client';

import { cn } from '@/lib/utils/cn';
import {
  ATTENDANCE_STATUS_COLORS,
  getStatusLabel,
  type AttendanceCalendarStatus,
  type AttendanceDayCell,
} from '@/lib/attendance/attendance-calendar';

interface AttendanceDashboardStatsProps {
  present: number;
  absent: number;
  late: number;
  leave: number;
  paidLeave: number;
  holiday: number;
  halfDay: number;
  weekend: number;
  todayStatus?: AttendanceCalendarStatus;
  todayDay?: Pick<AttendanceDayCell, 'status' | 'isLate' | 'isPaidLeave'>;
  monthLabel: string;
  attendancePct?: number;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

function StatRow({
  label,
  value,
  color,
  isToday,
  compact,
}: {
  label: string;
  value: number | string;
  color: string;
  isToday?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-slate-100 last:border-b-0',
        compact ? 'py-1.5' : 'gap-4 py-2.5',
        isToday && 'border-b-0 pt-1',
      )}
    >
      <div className={cn('flex min-w-0 items-center', compact ? 'gap-2' : 'gap-2.5')}>
        <span
          className={cn(
            'shrink-0 rounded-full',
            isToday ? 'h-2.5 w-2.5' : compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
          )}
          style={{ backgroundColor: color }}
        />
        <span
          className={cn(
            'text-slate-600',
            compact ? 'text-xs' : 'text-sm',
            isToday && 'font-medium text-[#2e7ad1]',
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums text-slate-800',
          compact ? 'text-sm' : 'text-base',
          isToday && 'text-[#2e7ad1]',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AttendanceDashboardStats({
  present,
  absent,
  late,
  leave,
  paidLeave,
  holiday,
  halfDay,
  weekend,
  todayStatus,
  todayDay,
  monthLabel,
  attendancePct = 0,
  loading,
  compact,
  className,
}: AttendanceDashboardStatsProps) {
  const rows = [
    { label: 'Present', value: present, status: 'present' as const },
    { label: 'Absent', value: absent, status: 'absent' as const },
    { label: 'Present (Late)', value: late, status: 'late' as const },
    { label: 'Leave', value: leave, status: 'leave' as const },
    { label: 'Paid Leave', value: paidLeave, status: 'paid-leave' as const },
    { label: 'Holiday', value: holiday, status: 'holiday' as const },
    { label: 'Half Day', value: halfDay, status: 'half-day' as const },
    { label: 'Weekend', value: weekend, status: 'weekend' as const },
  ];

  const todayLabel =
    todayStatus && todayStatus !== 'future' && todayStatus !== 'outside' && todayStatus !== 'empty'
      ? getStatusLabel(todayStatus, todayDay)
      : '—';

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        className={cn(
          'mb-3 flex items-baseline justify-between gap-2 rounded-lg bg-slate-50/80 px-2.5 py-2',
          !compact && 'mb-4 gap-3 px-3 py-2.5',
        )}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#2e7ad1]/80">This month</p>
          <p className={cn('mt-0.5 font-semibold text-slate-800', compact ? 'text-sm' : 'text-base')}>
            {monthLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rate</p>
          <p className={cn('font-bold tabular-nums text-[#2e7ad1]', compact ? 'text-base' : 'text-lg')}>
            {attendancePct}%
          </p>
        </div>
      </div>

      {loading ? (
        <p className={cn('text-center text-slate-400', compact ? 'py-6 text-xs' : 'py-10 text-sm')}>
          Loading…
        </p>
      ) : (
        <div
          className={cn(
            'grid flex-1',
            compact ? 'grid-cols-1 sm:grid-cols-2 sm:gap-x-4' : 'gap-x-6 sm:grid-cols-2',
          )}
        >
          {compact ? (
            <>
              <div>
                {rows.slice(0, 4).map((row) => (
                  <StatRow
                    key={row.status}
                    label={row.label}
                    value={row.value}
                    color={ATTENDANCE_STATUS_COLORS[row.status]}
                    compact
                  />
                ))}
              </div>
              <div>
                {rows.slice(4).map((row) => (
                  <StatRow
                    key={row.status}
                    label={row.label}
                    value={row.value}
                    color={ATTENDANCE_STATUS_COLORS[row.status]}
                    compact
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                {rows.slice(0, 4).map((row) => (
                  <StatRow
                    key={row.status}
                    label={row.label}
                    value={row.value}
                    color={ATTENDANCE_STATUS_COLORS[row.status]}
                  />
                ))}
              </div>
              <div>
                {rows.slice(4).map((row) => (
                  <StatRow
                    key={row.status}
                    label={row.label}
                    value={row.value}
                    color={ATTENDANCE_STATUS_COLORS[row.status]}
                  />
                ))}
              </div>
            </>
          )}
          <div
            className={cn(
              'mt-1 rounded-lg border border-emerald-100 bg-emerald-50/50 px-2',
              'sm:col-span-2',
            )}
          >
            <StatRow
              label="Today"
              value={todayLabel}
              color={ATTENDANCE_STATUS_COLORS.present}
              isToday
              compact={compact}
            />
          </div>
        </div>
      )}
    </div>
  );
}
