'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  ATTENDANCE_STATUS_BG,
  ATTENDANCE_STATUS_COLORS,
  ATTENDANCE_STATUS_TEXT,
  ATTENDANCE_LEGEND_ITEMS,
  DAILY_TARGET_LEGEND,
  buildMonthCalendar,
  CALENDAR_GRID_COLS,
  CALENDAR_GRID_ROWS,
  getStatusLabel,
  type AttendanceDayCell,
  type AttendanceCalendarStatus,
  type CalendarGridCell,
} from '@/lib/attendance/attendance-calendar';
import { DAILY_NET_WORK_TARGET_LABEL } from '@/lib/attendance/attendance-shift.constants';

interface AttendanceMonthCalendarProps {
  year: number;
  month: number;
  monthLabel: string;
  dailyBreakdown: AttendanceDayCell[];
  loading?: boolean;
  className?: string;
  variant?: 'full' | 'dashboard';
  appearance?: 'filled' | 'minimal' | 'soft';
  weekStart?: 'sun' | 'mon';
  hideHeader?: boolean;
  hideLegend?: boolean;
  fillWidth?: boolean;
  /** Larger day cells for dashboard sidebar */
  largeCells?: boolean;
  /** Smaller compact cells for dashboard embed */
  compactCells?: boolean;
}

function getFilledCellStyle(
  status: AttendanceCalendarStatus,
  isToday: boolean,
  isOutside: boolean,
): { background: string; color: string; fontWeight?: string } {
  if (isToday) {
    return { background: ATTENDANCE_STATUS_COLORS.present, color: '#ffffff', fontWeight: '700' };
  }
  if (isOutside || status === 'outside') {
    return { background: 'transparent', color: '#CBD5E1' };
  }
  if (status === 'future') {
    return { background: '#F8FAFC', color: '#94A3B8' };
  }
  if (status === 'weekend') {
    return { background: ATTENDANCE_STATUS_BG.weekend, color: '#94A3B8' };
  }
  if (status === 'empty') {
    return { background: '#ffffff', color: '#64748B' };
  }

  const s = status as Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside'>;
  return {
    background: ATTENDANCE_STATUS_BG[s],
    color: ATTENDANCE_STATUS_TEXT[s as keyof typeof ATTENDANCE_STATUS_TEXT] ?? '#334155',
    fontWeight: '600',
  };
}

function getSoftCellStyle(
  status: AttendanceCalendarStatus,
  isToday: boolean,
  isOutside: boolean,
): { background: string; color: string; borderColor?: string } {
  if (isToday) {
    return {
      background: ATTENDANCE_STATUS_COLORS.present,
      color: '#ffffff',
      borderColor: '#16A34A',
    };
  }
  if (isOutside || status === 'outside') {
    return { background: 'transparent', color: '#CBD5E1' };
  }
  if (status === 'future') {
    return { background: '#F8FAFC', color: '#94A3B8', borderColor: '#F1F5F9' };
  }
  if (status === 'weekend') {
    return { background: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' };
  }
  if (status === 'empty') {
    return { background: '#FFFFFF', color: '#64748B', borderColor: '#F1F5F9' };
  }

  const s = status as Exclude<AttendanceCalendarStatus, 'empty' | 'future' | 'outside'>;
  return {
    background: ATTENDANCE_STATUS_BG[s],
    color: ATTENDANCE_STATUS_TEXT[s as keyof typeof ATTENDANCE_STATUS_TEXT] ?? '#334155',
    borderColor: `${ATTENDANCE_STATUS_COLORS[s]}33`,
  };
}

function statusDotColor(status: AttendanceCalendarStatus): string | null {
  if (status === 'outside' || status === 'empty' || status === 'future') return null;
  if (status === 'weekend') return ATTENDANCE_STATUS_COLORS.weekend;
  return ATTENDANCE_STATUS_COLORS[status as keyof typeof ATTENDANCE_STATUS_COLORS];
}

function CalendarDayButton({
  cell,
  isToday,
  selected,
  onSelect,
  compact,
  minimal,
  soft,
  largeCells,
  compactCells,
}: {
  cell: CalendarGridCell;
  isToday: boolean;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  minimal?: boolean;
  soft?: boolean;
  largeCells?: boolean;
  compactCells?: boolean;
}) {
  const isOutside = cell.type === 'outside';
  const status = cell.calendarStatus;
  const quotaMet = cell.type === 'day' && cell.record?.dailyTargetMet;
  const title =
    cell.type === 'day'
      ? `${cell.day}: ${getStatusLabel(status, cell.record)}${cell.record?.checkInTime ? ` · ${cell.record.checkInTime}` : ''}${quotaMet ? ` · ${DAILY_NET_WORK_TARGET_LABEL} complete` : ''}`
      : undefined;

  if (soft) {
    const style = getSoftCellStyle(status, isToday && cell.type === 'day', isOutside);

    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={isOutside}
        title={title}
        className={cn(
          'relative mx-auto flex aspect-square w-full items-center justify-center rounded-md border font-semibold transition-all duration-150',
          compactCells
            ? 'max-w-[28px] text-[10px] sm:max-w-[30px]'
            : largeCells
              ? 'max-w-[44px] text-sm sm:max-w-[48px]'
              : 'max-w-[34px] text-[11px] sm:max-w-[36px]',
          !isOutside && 'hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
          isOutside && 'cursor-default border-transparent',
          isToday && cell.type === 'day' && 'shadow-sm ring-2 ring-[#2e7ad1]/30',
          selected && !isToday && 'ring-2 ring-slate-300/80',
          status === 'future' && 'font-medium',
        )}
        style={{
          backgroundColor: style.background,
          color: style.color,
          borderColor: isOutside ? 'transparent' : style.borderColor ?? '#F1F5F9',
        }}
      >
        <span className="flex items-center gap-px leading-none">
          <span>{cell.day}</span>
          {quotaMet && (
            <CheckCircle2
              className={cn(
                'shrink-0 text-[#2e7ad1]',
                compactCells ? 'h-2 w-2' : 'h-2.5 w-2.5',
              )}
              aria-label={`${DAILY_NET_WORK_TARGET_LABEL} complete`}
            />
          )}
        </span>
      </button>
    );
  }

  if (minimal) {
    const dot = statusDotColor(status);
    const showDot =
      cell.type === 'day' && dot && status !== 'future' && !isToday;

    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={isOutside}
        title={title}
        className={cn(
          'relative mx-auto flex aspect-square w-full max-w-[34px] items-center justify-center rounded-full text-[11px] font-medium transition-all duration-200 sm:max-w-[36px] sm:text-xs',
          quotaMet && 'ring-1 ring-emerald-400/60',
          !isOutside && 'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
          isOutside && 'cursor-default text-slate-300/90',
          cell.type === 'day' && !isToday && !isOutside && 'text-slate-600',
          isToday && cell.type === 'day' && 'bg-[#22C55E] font-bold text-white shadow-md',
          selected && !isToday && 'bg-slate-100',
          status === 'future' && 'text-slate-300',
        )}
      >
        {showDot && !quotaMet && (
          <span
            className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-white"
            style={{ backgroundColor: dot }}
            aria-hidden
          />
        )}
        {quotaMet && (
          <CheckCircle2
            className="absolute -right-0.5 -top-0.5 h-3 w-3 text-[#2e7ad1]"
            aria-label={`${DAILY_NET_WORK_TARGET_LABEL} complete`}
          />
        )}
        <span>{cell.day}</span>
      </button>
    );
  }

  const style = getFilledCellStyle(status, isToday && cell.type === 'day', isOutside);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isOutside}
      title={title}
      className={cn(
        'relative flex aspect-square w-full max-w-[45px] items-center justify-center rounded-xl text-sm transition-all',
        'sm:max-w-[56px] md:max-w-[70px] lg:max-w-[85px] xl:max-w-[90px]',
        compact && 'max-w-[40px] rounded-lg text-xs sm:max-w-[52px] md:max-w-[64px] lg:max-w-[72px]',
        !isOutside && 'hover:scale-105 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
        isToday && cell.type === 'day' && 'shadow-md ring-2 ring-emerald-400/30',
        selected && !isToday && 'ring-2 ring-slate-300',
        isOutside && 'cursor-default',
        status === 'future' && 'opacity-70',
      )}
      style={style}
    >
      <span className={cn('leading-none', isToday && cell.type === 'day' && 'text-white')}>{cell.day}</span>
      {quotaMet && (
        <CheckCircle2
          className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 text-[#2e7ad1] drop-shadow"
          aria-label={`${DAILY_NET_WORK_TARGET_LABEL} complete`}
        />
      )}
    </button>
  );
}

function CompactLegend({ dense }: { dense?: boolean }) {
  const items = ATTENDANCE_LEGEND_ITEMS.filter((i) =>
    ['present', 'absent', 'late', 'leave', 'holiday'].includes(i.status),
  );

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center',
        dense ? 'mt-2 gap-x-2 gap-y-1' : 'mt-3 gap-x-3 gap-y-1.5',
      )}
    >
      {items.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1">
          <span
            className={cn('rounded-sm', dense ? 'h-1.5 w-1.5' : 'h-2 w-2')}
            style={{ backgroundColor: ATTENDANCE_STATUS_COLORS[item.status] }}
          />
          <span className={cn('font-medium text-slate-500', dense ? 'text-[9px]' : 'text-[10px]')}>
            {item.label}
          </span>
        </span>
      ))}
      <span className="inline-flex items-center gap-0.5">
        <CheckCircle2 className={cn('text-[#2e7ad1]', dense ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
        <span className={cn('font-medium text-slate-500', dense ? 'text-[9px]' : 'text-[10px]')}>
          {DAILY_TARGET_LEGEND.label}
        </span>
      </span>
    </div>
  );
}

function DashboardLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
      {ATTENDANCE_LEGEND_ITEMS.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: ATTENDANCE_STATUS_COLORS[item.status] }}
          />
          <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: ATTENDANCE_STATUS_COLORS.present }}
        >
          •
        </span>
        <span className="text-[11px] font-medium text-slate-500">Today</span>
      </span>
    </div>
  );
}

export function AttendanceMonthCalendar({
  year,
  month,
  monthLabel,
  dailyBreakdown,
  loading,
  className,
  variant = 'full',
  appearance = 'filled',
  weekStart = 'mon',
  hideHeader,
  hideLegend,
  fillWidth,
  largeCells,
  compactCells,
}: AttendanceMonthCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const isDashboard = variant === 'dashboard';
  const soft = appearance === 'soft';
  const minimal = appearance === 'minimal';

  const { weekdays, cells } = useMemo(
    () => buildMonthCalendar(year, month, dailyBreakdown, weekStart),
    [year, month, dailyBreakdown, weekStart],
  );

  const todayKey = useMemo(() => todayDateKey(), []);

  const selectedDay = selectedDate
    ? cells.find((c) => c.type === 'day' && c.dateKey === selectedDate)
    : null;

  const gridGap = soft
    ? compactCells
      ? '3px'
      : largeCells
        ? '8px'
        : '5px'
    : minimal
      ? '4px'
      : '6px';

  return (
    <div className={cn('w-full min-w-0', className)}>
      {!hideHeader && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Calendar — {monthLabel}</h3>
          {selectedDay && selectedDay.type === 'day' && (
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                {new Date(`${selectedDay.dateKey}T00:00:00`).toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              {' · '}
              {getStatusLabel(selectedDay.calendarStatus)}
              {selectedDay.record?.checkInTime ? ` · ${selectedDay.record.checkInTime}` : ''}
            </p>
          )}
        </div>
      )}

      {soft && hideHeader && (
        <div className="mb-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Calendar</p>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-slate-800">{monthLabel}</p>
        </div>
      )}

      <div
        className={cn(
          'overflow-x-auto',
          !minimal && !soft && 'rounded-xl border border-slate-200 bg-white p-2 sm:p-3',
        )}
      >
        {loading ? (
          <div className="flex h-44 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
              <p className="text-xs text-slate-400">Loading calendar…</p>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'w-full',
              fillWidth && soft && 'mx-auto max-w-[340px]',
              compactCells && soft && 'mx-auto w-full max-w-[228px]',
              largeCells && soft && !compactCells && 'mx-auto w-full max-w-[min(100%,520px)]',
              !fillWidth && !minimal && !soft && 'mx-auto max-w-2xl',
              !fillWidth && minimal && 'mx-auto max-w-[260px]',
            )}
          >
            <div
              className="mb-2 grid"
              style={{
                gridTemplateColumns: `repeat(${CALENDAR_GRID_COLS}, minmax(0, 1fr))`,
                gap: gridGap,
              }}
            >
              {weekdays.map((wd, i) => (
                <div
                  key={`${wd}-${i}`}
                  className={cn(
                    'flex items-center justify-center font-semibold uppercase',
                    soft
                      ? compactCells
                        ? 'h-5 text-[8px] tracking-wide text-slate-400'
                        : largeCells
                          ? 'h-8 text-[11px] tracking-wider text-slate-400'
                          : 'h-6 text-[9px] tracking-wider text-slate-400'
                      : minimal
                        ? 'h-6 text-[9px] tracking-wide text-slate-400 sm:text-[10px]'
                        : 'aspect-square text-slate-400',
                  )}
                >
                  {wd}
                </div>
              ))}
            </div>

            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${CALENDAR_GRID_COLS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${CALENDAR_GRID_ROWS}, minmax(0, 1fr))`,
                gap: gridGap,
              }}
            >
              {cells.map((cell) => (
                <CalendarDayButton
                  key={cell.dateKey}
                  cell={cell}
                  isToday={cell.dateKey === todayKey}
                  selected={selectedDate === cell.dateKey}
                  compact={isDashboard && !soft}
                  minimal={minimal}
                  soft={soft}
                  largeCells={largeCells}
                  compactCells={compactCells}
                  onSelect={() => {
                    if (cell.type === 'day') {
                      setSelectedDate((prev) => (prev === cell.dateKey ? null : cell.dateKey));
                    }
                  }}
                />
              ))}
            </div>

            {soft && selectedDay && selectedDay.type === 'day' && (
              <p className={cn('text-center text-slate-500', compactCells ? 'mt-1.5 text-[10px]' : 'mt-3 text-xs')}>
                <span className="font-medium text-slate-700">
                  {new Date(`${selectedDay.dateKey}T00:00:00`).toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                {' · '}
                <span
                  className="font-semibold"
                  style={{
                    color:
                      selectedDay.calendarStatus === 'outside' || selectedDay.calendarStatus === 'future'
                        ? '#64748B'
                        : ATTENDANCE_STATUS_COLORS[
                            selectedDay.calendarStatus as keyof typeof ATTENDANCE_STATUS_COLORS
                          ] ?? '#64748B',
                  }}
                >
                  {getStatusLabel(selectedDay.calendarStatus, selectedDay.record)}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {soft && !hideLegend && !loading && <CompactLegend dense={compactCells} />}
      {isDashboard && !soft && !hideLegend && !loading && <DashboardLegend />}
    </div>
  );
}
