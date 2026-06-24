'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { ExcelGridCell } from '@/components/attendance/ExcelGridCell';
import { xlScrollClass } from '@/lib/attendance/xl-sheet-theme';
import { WorkDurationCell } from '@/lib/attendance/work-duration-display';
import {
  DAILY_GROSS_TARGET_LABEL,
  DAILY_GROSS_TARGET_MINUTES,
  DAILY_NET_WORK_TARGET_LABEL,
  DAILY_NET_WORK_TARGET_MINUTES,
} from '@/lib/attendance/attendance-shift.constants';
import {
  computeNetWorkMinutes,
  isDailyGrossQuotaMet,
  isDailyNetQuotaMet,
} from '@/lib/attendance/net-work-minutes';
import { useLiveAttendanceRows } from '@/hooks/useLiveAttendanceRows';
import { todayDateKeyIst } from '@/lib/attendance/ist-date';
import { isWeekendDateKey, weekdayShortFromDateKey } from '@/lib/constants/workspace-timezone';
import { formatDateShort } from '@/lib/datetime';
import { formatAttendanceStatusLabel } from '@/lib/attendance/late-attendance';

const BASE_COLUMNS = [
  '#',
  'Date',
  'Day',
  'Status',
  'Login',
  'Logout',
  `Login (${DAILY_GROSS_TARGET_LABEL})`,
  `Working (${DAILY_NET_WORK_TARGET_LABEL})`,
] as const;

const STATUS_STYLES: Record<string, string> = {
  present: 'bg-[#22C55E]/15 text-[#15803D] font-semibold',
  absent: 'bg-[#EF4444]/15 text-[#B91C1C] font-semibold',
  leave: 'bg-[#3B82F6]/15 text-[#1D4ED8] font-semibold',
  'paid-leave': 'bg-[#8B5CF6]/15 text-[#6D28D9] font-semibold',
  'half-day': 'bg-[#EAB308]/20 text-[#A16207] font-semibold',
  late: 'bg-[#F59E0B]/20 text-[#B45309] font-semibold',
  weekend: 'bg-[#E5E7EB] text-slate-500 font-semibold',
  holiday: 'bg-[#14B8A6]/15 text-[#0F766E] font-semibold',
};

export interface AttendanceDailyRow {
  date: string;
  status: string;
  hoursWorked: number;
  isLate?: boolean;
  isPaidLeave?: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  workDurationMinutes?: number;
  workDurationFormatted?: string;
  grossWorkDurationMinutes?: number;
  grossWorkDurationFormatted?: string;
  breakMinutes?: number;
  dailyTargetMet?: boolean;
  dailyGrossTargetMet?: boolean;
}

interface AttendanceDailyExcelGridProps {
  rows: AttendanceDailyRow[];
  loading?: boolean;
  sheetTitle?: string;
  monthLabel?: string;
  canEdit?: boolean;
  onEditRow?: (row: AttendanceDailyRow) => void;
  /** Tick today's gross/net from live punch timer */
  liveToday?: boolean;
}

function GridCell(props: {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return <ExcelGridCell {...props} />;
}

function resolveGrossMinutes(day: AttendanceDailyRow): number {
  if (day.grossWorkDurationMinutes != null) return day.grossWorkDurationMinutes;
  if (day.workDurationMinutes != null && day.breakMinutes != null) {
    return day.workDurationMinutes + day.breakMinutes;
  }
  if (day.hoursWorked > 0) return Math.round(day.hoursWorked * 60);
  return 0;
}

function resolveNetMinutes(day: AttendanceDailyRow): number {
  if (day.workDurationMinutes != null) return day.workDurationMinutes;
  if (day.hoursWorked > 0) return Math.round(day.hoursWorked * 60);
  return 0;
}

function isInProgress(day: AttendanceDailyRow): boolean {
  return Boolean(day.checkInTime && !day.checkOutTime);
}

export function AttendanceDailyExcelGrid({
  rows,
  loading,
  sheetTitle = 'Daily Attendance',
  monthLabel,
  canEdit,
  onEditRow,
  liveToday = false,
}: AttendanceDailyExcelGridProps) {
  const { rows: displayRows, liveSeconds, isRunning: sessionLive } = useLiveAttendanceRows(
    rows,
    liveToday,
  );
  const todayKey = todayDateKeyIst();
  const columns = canEdit ? [...BASE_COLUMNS, 'Edit'] : [...BASE_COLUMNS];
  const colCount = columns.length;

  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: displayRows.length,
    colCount,
    enabled: !loading && displayRows.length > 0,
  });

  const title = monthLabel ? `${sheetTitle} — ${monthLabel}` : sheetTitle;

  return (
    <ExcelSheetShell title={title} rowCount={rows.length} loading={loading}>
      <div
        ref={containerRef}
        className={cn(
          'min-h-[200px] max-h-[min(52vh,520px)] w-full bg-white',
          xlScrollClass,
        )}
        onMouseDown={(e) => {
          const cell = (e.target as HTMLElement).closest('[data-grid-row]');
          if (cell) {
            const row = Number(cell.getAttribute('data-grid-row'));
            const col = Number(cell.getAttribute('data-grid-col'));
            if (!Number.isNaN(row) && !Number.isNaN(col)) setCell({ row, col });
          }
        }}
      >
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              {columns.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                    i === 0 && 'sticky left-0 z-40 w-10 text-center',
                    i >= 3 && 'text-center',
                    (label.startsWith('Login') || label.startsWith('Working')) && 'min-w-[112px]',
                  )}
                  title={
                    label.startsWith('Login')
                      ? 'Login time (pauses on logout; tea/lunch/approved meeting keep running) — target 9h'
                      : label.startsWith('Working')
                        ? 'Net working time after breaks — matches dashboard — target 7h 45m'
                        : undefined
                  }
                >
                  <span className="block leading-tight">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  No records for this period
                </td>
              </tr>
            ) : (
              displayRows.map((day, rowIdx) => {
                const dateKey = day.date.slice(0, 10);
                const dayName = weekdayShortFromDateKey(dateKey);
                const dateStr = formatDateShort(`${dateKey}T12:00:00`);
                const rawStatus = day.status?.toLowerCase() ?? '';
                const effectiveStatus =
                  rawStatus === 'weekend' && !isWeekendDateKey(dateKey) ? 'absent' : rawStatus;
                const statusKey =
                  day.isLate && (effectiveStatus === 'present' || effectiveStatus === 'half-day')
                    ? 'late'
                    : effectiveStatus === 'leave' && day.isPaidLeave
                      ? 'paid-leave'
                      : effectiveStatus;
                const statusClass = STATUS_STYLES[statusKey] ?? 'bg-slate-100 text-slate-700';
                const statusLabel = formatAttendanceStatusLabel(
                  effectiveStatus,
                  day.isLate,
                  day.isPaidLeave,
                );

                const grossMinutes = day.grossWorkDurationMinutes ?? resolveGrossMinutes(day);
                const netMinutes = day.workDurationMinutes ?? resolveNetMinutes(day);
                const isTodayRow = day.date.slice(0, 10) === todayKey;
                const isLive = liveToday && isTodayRow && sessionLive;

                const cells: React.ReactNode[] = [
                  rowIdx + 1,
                  dateStr,
                  dayName,
                  statusLabel,
                  day.checkInTime ?? '—',
                  day.checkOutTime ?? '—',
                  <WorkDurationCell
                    key="gross"
                    variant="gross"
                    minutes={grossMinutes}
                    targetMinutes={DAILY_GROSS_TARGET_MINUTES}
                    targetLabel={DAILY_GROSS_TARGET_LABEL}
                    met={day.dailyGrossTargetMet ?? isDailyGrossQuotaMet(grossMinutes)}
                    inProgress={isLive}
                    liveSeconds={isLive ? liveSeconds : undefined}
                  />,
                  <WorkDurationCell
                    key="net"
                    variant="net"
                    minutes={netMinutes}
                    targetMinutes={DAILY_NET_WORK_TARGET_MINUTES}
                    targetLabel={DAILY_NET_WORK_TARGET_LABEL}
                    met={day.dailyTargetMet ?? isDailyNetQuotaMet(netMinutes)}
                    inProgress={isLive && !(day.dailyTargetMet ?? isDailyNetQuotaMet(netMinutes))}
                    liveSeconds={isLive ? liveSeconds : undefined}
                  />,
                ];

                return (
                  <tr key={day.date + rowIdx} className="even:bg-[#fafafa] transition-colors duration-150 hover:bg-[#e7f3ff]/30">
                    {cells.map((content, col) => {
                      const active = activeCell.row === rowIdx && activeCell.col === col;
                      const onActivate = () => setCell({ row: rowIdx, col });
                      const isStatus = col === 3;

                      return (
                        <GridCell
                          key={col}
                          row={rowIdx}
                          col={col}
                          active={active}
                          sticky={col === 0}
                          align={col === 0 || col >= 3 ? 'center' : 'left'}
                          className={isStatus ? statusClass : undefined}
                          onActivate={onActivate}
                        >
                          {content}
                        </GridCell>
                      );
                    })}
                    {canEdit && (
                      <GridCell
                        row={rowIdx}
                        col={cells.length}
                        active={activeCell.row === rowIdx && activeCell.col === cells.length}
                        align="center"
                        onActivate={() => setCell({ row: rowIdx, col: cells.length })}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditRow?.(day);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </GridCell>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ExcelSheetShell>
  );
}
