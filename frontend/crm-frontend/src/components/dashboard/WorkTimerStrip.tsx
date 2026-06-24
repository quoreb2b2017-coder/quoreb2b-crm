'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Timer, Clock, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWorkTimer } from '@/hooks/useWorkTimer';
import { DAILY_NET_WORK_TARGET_LABEL } from '@/lib/attendance/attendance-shift.constants';

interface WorkTimerStripProps {
  className?: string;
}

const MAX_DAY_MINUTES = 24 * 60;

function capDayMinutes(minutes: number): number {
  return Math.min(Math.max(0, minutes), MAX_DAY_MINUTES);
}

export function WorkTimerStrip({ className }: WorkTimerStripProps) {
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
    dailyTargetMinutes,
    onBreak,
    reload,
    todayFirstLoginTime,
    todayLastLogoutTime,
    isOnDuty,
    todaySessions,
  } = useWorkTimer(true);

  const days = useMemo(() => dailyBreakdown ?? [], [dailyBreakdown]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 110, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className={cn('animate-pulse rounded-xl bg-white/5 px-3 py-4', className)}>
        <div className="h-14 rounded-lg bg-white/10" />
      </div>
    );
  }

  return (
    <div className={cn('w-full space-y-2', className)}>
      {(todayFirstLoginTime || todaySessions.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-white/70">
          <span>
            <span className="font-bold uppercase tracking-wide text-white/45">First login · </span>
            {todayFirstLoginTime ?? '—'}
          </span>
          {!isOnDuty && todayLastLogoutTime && (
            <span>
              <span className="font-bold uppercase tracking-wide text-white/45">Last logout · </span>
              {todayLastLogoutTime}
            </span>
          )}
          {isOnDuty && (
            <span className="text-emerald-200/90">On duty now</span>
          )}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,130px)_1fr_minmax(0,120px)] lg:items-center lg:gap-4">
        {/* Today total (all sessions) */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 lg:flex-col lg:items-start lg:justify-center">
          <div>
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
              <Timer className="h-3 w-3" />
              Today total
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums leading-none text-white">
              {todayLiveFormatted}
            </p>
            <p className="mt-0.5 text-[10px] text-white/50">
              {!isRunning && !onBreak
                ? 'Paused · logged out or idle'
                : onBreak
                  ? `On break · ${isRunning ? `session ${liveFormatted}` : 'timer running'}`
                  : `Live · this session ${liveFormatted}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => reload()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/70 hover:bg-white/15"
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
        </div>

        {/* Daily */}
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
              <CalendarDays className="h-3 w-3" />
              Net hours · target {DAILY_NET_WORK_TARGET_LABEL}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className="rounded-md border border-white/10 bg-white/5 p-1 text-white/60 hover:bg-white/10"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className="rounded-md border border-white/10 bg-white/5 p-1 text-white/60 hover:bg-white/10"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto px-0.5 pb-1 pt-0.5 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {days.length === 0 ? (
              <p className="py-2 text-[11px] text-white/45">No time logged this month</p>
            ) : (
              days.map((day) => {
                const displayFormatted = day.isToday
                  ? todayLiveFormatted
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
                      'flex min-w-[76px] shrink-0 flex-col items-center rounded-lg px-2 py-2 text-center',
                      day.isToday
                        ? 'bg-teal-400/25 ring-1 ring-teal-300/50'
                        : 'bg-white/5 hover:bg-white/10',
                      targetMet && !day.isToday && 'bg-emerald-400/10 ring-1 ring-emerald-400/45',
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
                          day.isToday ? 'text-teal-100' : 'text-white/50',
                        )}
                      >
                        {day.dayLabel}
                      </span>
                      {targetMet && (
                        <CheckCircle2
                          className="h-3 w-3 shrink-0 text-emerald-300"
                          aria-label="Target met"
                        />
                      )}
                      {day.isToday && isRunning && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'mt-1 font-mono text-[11px] font-bold tabular-nums leading-tight',
                        day.isToday ? 'text-teal-50' : 'text-white',
                      )}
                    >
                      {displayFormatted}
                    </span>
                    {displayMinutes >= MAX_DAY_MINUTES && (
                      <span className="text-[7px] text-amber-200/80">max</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Month */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 lg:flex-col lg:items-end lg:justify-center">
          <div className="lg:text-right">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/45 lg:justify-end">
              <Clock className="h-3 w-3" />
              This month
            </p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-teal-200">
              {monthlyFormatted}
            </p>
            {periodLabel && (
              <p className="text-[10px] text-white/45">{periodLabel}</p>
            )}
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
              isRunning ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-white/50',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isRunning ? 'animate-pulse bg-emerald-300' : 'bg-slate-400',
              )}
            />
            {isRunning ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>

      {todaySessions.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-white/45">
            Today&apos;s sessions · login → logout
          </p>
          <div className="flex flex-wrap gap-1.5">
            {todaySessions.map((s) => (
              <div
                key={s.sessionId + s.loginAt}
                className={cn(
                  'rounded-lg border px-2 py-1 text-[10px] tabular-nums',
                  s.stillActive
                    ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-50'
                    : 'border-white/15 bg-white/5 text-white/80',
                )}
                title={`${s.loginTime} → ${s.logoutTime ?? 'now'}`}
              >
                <span className="font-bold text-white/50">#{s.index}</span>{' '}
                {s.loginTime}
                <span className="text-white/40"> → </span>
                {s.stillActive ? (
                  <span className="font-semibold text-emerald-200">Live</span>
                ) : (
                  s.logoutTime ?? '—'
                )}
                <span className="ml-1 font-mono font-semibold text-white/90">
                  {s.durationFormatted}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
