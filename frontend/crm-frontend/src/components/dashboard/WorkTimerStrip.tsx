'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Timer, Clock, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWorkTimer } from '@/hooks/useWorkTimer';
import { DAILY_NET_WORK_TARGET_LABEL } from '@/lib/attendance/attendance-shift.constants';
import { formatDurationFromMinutes } from '@/lib/api/work-time.service';

interface WorkTimerStripProps {
  className?: string;
  variant?: 'light' | 'dark';
  /** Tighter layout for dashboard welcome banner */
  compact?: boolean;
}

const MAX_DAY_MINUTES = 24 * 60;

function capDayMinutes(minutes: number): number {
  return Math.min(Math.max(0, minutes), MAX_DAY_MINUTES);
}

function timerSkin(light: boolean) {
  return {
    panel: light ? 'border-slate-200/90 bg-slate-50/90' : 'border-white/10 bg-white/5',
    label: light ? 'text-slate-400' : 'text-white/45',
    value: light ? 'text-slate-900' : 'text-white',
    sub: light ? 'text-slate-500' : 'text-white/50',
    meta: light ? 'text-slate-600' : 'text-white/70',
    btn: light
      ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      : 'border-white/15 bg-white/10 text-white/70 hover:bg-white/15',
    navBtn: light
      ? 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10',
    dayToday: light ? 'bg-[#e8f1fb] ring-1 ring-[#2e7ad1]/30' : 'bg-white/20 ring-1 ring-white/40',
    dayNormal: light
      ? 'border border-slate-100 bg-white hover:bg-slate-50'
      : 'bg-white/5 hover:bg-white/10',
    dayMet: light ? 'bg-[#e8f1fb]/80 ring-1 ring-[#2e7ad1]/20' : 'bg-white/15 ring-1 ring-white/30',
    dayLabel: light ? 'text-slate-500' : 'text-white/50',
    dayLabelToday: light ? 'text-[#2568b8]' : 'text-white/90',
    dayValue: light ? 'text-slate-800' : 'text-white',
    livePillOn: light ? 'bg-[#e8f1fb] text-[#2568b8]' : 'bg-white/20 text-white/90',
    livePillOff: light ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-white/50',
    skeleton: light ? 'bg-slate-100' : 'bg-white/5',
    skeletonInner: light ? 'bg-slate-200' : 'bg-white/10',
  };
}

export function WorkTimerStrip({ className, variant = 'light', compact = false }: WorkTimerStripProps) {
  const light = variant === 'light';
  const t = timerSkin(light);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    isRunning,
    liveFormatted,
    monthlyFormatted,
    periodLabel,
    loading,
    dailyBreakdown,
    todayLiveFormatted,
    todayLiveMinutes,
    todayLiveGrossMinutes,
    dailyTargetMinutes,
    onBreak,
    reload,
    todayFirstLoginTime,
    todayLastLogoutTime,
    isOnDuty,
  } = useWorkTimer(true);

  const days = useMemo(() => dailyBreakdown ?? [], [dailyBreakdown]);
  const todayWorkingFormatted = useMemo(
    () => formatDurationFromMinutes(todayLiveMinutes ?? 0),
    [todayLiveMinutes],
  );
  const todayLoginFormatted = useMemo(() => {
    if (todayLiveGrossMinutes != null && todayLiveGrossMinutes > 0) {
      return formatDurationFromMinutes(todayLiveGrossMinutes);
    }
    return todayLiveFormatted;
  }, [todayLiveGrossMinutes, todayLiveFormatted]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 110, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className={cn('animate-pulse rounded-md bg-slate-100 px-2 py-1.5', className)}>
        <div className="h-8 rounded bg-slate-200" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn('dash-timer-bar dash-work-timer--compact', className)}>
        <div className="dash-timer-stat">
          <span className="dash-timer-stat__label">Login</span>
          <span className="dash-timer-stat__value">{todayLoginFormatted}</span>
        </div>
        <div className="dash-timer-divider" aria-hidden />
        <div className="dash-timer-stat">
          <span className="dash-timer-stat__label">Working</span>
          <span className="dash-timer-stat__value">{todayWorkingFormatted}</span>
        </div>
        <div className="dash-timer-divider" aria-hidden />
        <div ref={scrollRef} className="dash-timer-scroll">
          {days.length === 0 ? (
            <span className="px-1 text-[10px] text-slate-400">No hours logged</span>
          ) : (
            days.map((day) => {
              const displayFormatted = day.isToday
                ? todayWorkingFormatted
                : day.totalFormatted;
              const displayMinutes = capDayMinutes(
                day.isToday ? todayLiveMinutes : day.totalMinutes,
              );
              const targetMet =
                day.dailyTargetMet ||
                displayMinutes >= (dailyTargetMinutes ?? 7 * 60 + 45);

              return (
                <div
                  key={day.date}
                  className={cn(
                    'dash-timer-day',
                    day.isToday && 'dash-timer-day--today',
                    targetMet && !day.isToday && 'dash-timer-day--met',
                  )}
                  title={`${day.date}${day.isToday ? ` · Login ${todayLoginFormatted}` : ''}`}
                >
                  <span className="dash-timer-day__label">{day.dayLabel}</span>
                  <span className="dash-timer-day__val">{displayFormatted}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="dash-timer-divider" aria-hidden />
        <div className="dash-timer-stat">
          <span className="dash-timer-stat__label">Month</span>
          <span className="dash-timer-stat__value">{monthlyFormatted}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full dash-work-timer', compact && 'dash-work-timer--compact', className)}>
      {!compact && (todayFirstLoginTime || todayLastLogoutTime || isOnDuty) && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-2 py-1 text-[10px]',
            t.panel,
            t.meta,
          )}
        >
          <span>
            <span className={cn('font-bold uppercase tracking-wide', t.label)}>First login · </span>
            {todayFirstLoginTime ?? '—'}
          </span>
          {!isOnDuty && todayLastLogoutTime && (
            <span>
              <span className={cn('font-bold uppercase tracking-wide', t.label)}>Last logout · </span>
              {todayLastLogoutTime}
            </span>
          )}
          {isOnDuty && <span className="font-medium text-[#2568b8]">On duty now</span>}
        </div>
      )}

      <div
        className={cn(
          'grid gap-1',
          compact
            ? 'sm:grid-cols-[minmax(0,4.5rem)_1fr_minmax(0,4.25rem)] sm:items-center lg:grid-cols-[4rem_1fr_4rem]'
            : 'lg:grid-cols-[minmax(0,118px)_1fr_minmax(0,108px)] lg:items-center lg:gap-2.5',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-1 rounded-md border',
            compact ? 'px-1 py-0.5 lg:px-1 lg:py-0.5' : 'rounded-lg px-2 py-2 lg:flex-col lg:items-start lg:justify-center',
            t.panel,
          )}
        >
          <div>
            <p className={cn('flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider', t.label)}>
              <Timer className="h-2 w-2 lg:h-2 lg:w-2" />
              Today
            </p>
            <p className={cn('font-mono font-bold tabular-nums leading-none', compact ? 'text-sm lg:text-xs' : 'mt-0.5 text-xl', t.value)}>
              {todayWorkingFormatted}
            </p>
            {!compact && (
              <p className={cn('mt-0.5 text-[10px]', t.sub)}>
                Working · Login {todayLoginFormatted}
                {onBreak
                  ? ' · on break'
                  : isRunning
                    ? ` · session ${liveFormatted}`
                    : !isOnDuty
                      ? ' · paused'
                      : ''}
              </p>
            )}
          </div>
          {!compact && (
          <button
            type="button"
            onClick={() => reload()}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
              t.btn,
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
          )}
        </div>

        <div className={cn('min-w-0 rounded-md border', compact ? 'px-1 py-0.5 lg:px-1 lg:py-0.5' : 'rounded-lg px-2 py-2', t.panel)}>
          <div className={cn('flex items-center justify-between gap-0.5', compact ? 'mb-0' : 'mb-1')}>
            <p className={cn('flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider', t.label)}>
              <CalendarDays className="h-2 w-2" />
              {compact ? 'Month' : `Net hours · target ${DAILY_NET_WORK_TARGET_LABEL}`}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className={cn('rounded-md border p-0.5', t.navBtn)}
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className={cn('rounded-md border p-0.5', t.navBtn)}
                aria-label="Scroll right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-0.5 overflow-x-auto px-0.5 py-0 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {days.length === 0 ? (
              <p className={cn('py-1.5 text-[11px]', t.label)}>No time logged this month</p>
            ) : (
              days.map((day) => {
                const displayFormatted = day.isToday
                  ? todayWorkingFormatted
                  : day.totalFormatted;
                const displayMinutes = capDayMinutes(
                  day.isToday ? todayLiveMinutes : day.totalMinutes,
                );
                const targetMet =
                  day.dailyTargetMet ||
                  displayMinutes >= (dailyTargetMinutes ?? 7 * 60 + 45);

                return (
                  <div
                    key={day.date}
                    className={cn(
                      'flex shrink-0 flex-col items-center rounded px-0.5 py-0.5 text-center',
                      compact ? 'min-w-[2.75rem] lg:min-w-[2.5rem]' : 'min-w-[68px] rounded-md px-1.5 py-1.5',
                      day.isToday ? t.dayToday : t.dayNormal,
                      targetMet && !day.isToday && t.dayMet,
                    )}
                    title={
                      targetMet
                        ? `${day.date} · ${DAILY_NET_WORK_TARGET_LABEL} complete`
                        : day.date
                    }
                  >
                    <div className="flex w-full items-center justify-center gap-0.5">
                      <span
                        className={cn(
                          'text-[8px] font-bold uppercase leading-none',
                          day.isToday ? t.dayLabelToday : t.dayLabel,
                        )}
                      >
                        {day.dayLabel}
                      </span>
                      {targetMet && (
                        <CheckCircle2
                          className={cn('h-3 w-3 shrink-0', light ? 'text-[#2e7ad1]' : 'text-white/90')}
                          aria-label="Target met"
                        />
                      )}
                      {day.isToday && isRunning && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2e7ad1]" />
                      )}
                    </div>
                    <span className={cn('mt-0.5 font-mono text-[11px] font-bold tabular-nums leading-tight', t.dayValue)}>
                      {displayFormatted}
                    </span>
                    {displayMinutes >= MAX_DAY_MINUTES && (
                      <span className="text-[7px] text-amber-500">max</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          className={cn(
            'flex items-center justify-between gap-1.5 rounded-md border',
            compact ? 'px-1.5 py-1 lg:flex-col lg:items-end' : 'rounded-lg px-2 py-2 lg:flex-col lg:items-end lg:justify-center',
            t.panel,
          )}
        >
          <div className="lg:text-right">
            <p className={cn('flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider lg:justify-end', t.label)}>
              <Clock className="h-2.5 w-2.5" />
              Total
            </p>
            <p className={cn('font-mono font-bold tabular-nums', compact ? 'text-sm' : 'mt-0.5 text-lg', light ? 'text-slate-800' : 'text-white/90')}>
              {monthlyFormatted}
            </p>
            {!compact && periodLabel && <p className={cn('text-[10px]', t.sub)}>{periodLabel}</p>}
          </div>
          {!compact && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
              isRunning ? t.livePillOn : t.livePillOff,
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isRunning ? 'animate-pulse bg-[#2e7ad1]' : 'bg-slate-400',
              )}
            />
            {isRunning ? 'Live' : 'Paused'}
          </span>
          )}
        </div>
      </div>
    </div>
  );
}
