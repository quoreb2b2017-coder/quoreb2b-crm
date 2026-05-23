'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Timer, Clock, CalendarDays, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWorkTimer } from '@/hooks/useWorkTimer';

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
    reload,
  } = useWorkTimer(true);

  const days = useMemo(() => dailyBreakdown ?? [], [dailyBreakdown]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 120, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-xl border border-white/15 bg-white/5 px-4 py-3',
          className,
        )}
      >
        <div className="h-16 w-full rounded-lg bg-white/10" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full rounded-xl border border-white/20 bg-black/20 px-3 py-3 backdrop-blur-md sm:px-4',
        className,
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-4">
        {/* Session — live clock */}
        <div className="flex shrink-0 items-center gap-3 xl:flex-col xl:items-start xl:justify-center xl:min-w-[108px]">
          <div>
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/50">
              <Timer className="h-3 w-3" />
              Session
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums leading-none text-white sm:text-2xl">
              {isRunning ? liveFormatted : 'Paused'}
            </p>
            <p className="mt-1 text-[10px] text-white/55">
              {isRunning ? 'Since login' : 'Pauses on logout'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => reload()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-white/15 xl:mt-1"
            title="Refresh work time"
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
        </div>

        <div className="hidden w-px shrink-0 bg-white/15 xl:block" />

        {/* Daily — horizontal scroll with controls */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/50">
              <CalendarDays className="h-3 w-3" />
              Daily
              <span className="hidden font-normal normal-case text-white/40 sm:inline">
                — today first, scroll for older
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className="rounded-md border border-white/15 bg-white/5 p-1 text-white/70 hover:bg-white/10"
                aria-label="Scroll older days left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className="rounded-md border border-white/15 bg-white/5 p-1 text-white/70 hover:bg-white/10"
                aria-label="Scroll older days right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="relative min-w-0">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-6 bg-gradient-to-r from-black/30 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-8 bg-gradient-to-l from-black/35 to-transparent"
              aria-hidden
            />
            <div
              ref={scrollRef}
              className="flex items-stretch gap-2 overflow-x-auto overflow-y-visible pb-1 pl-1 pr-2 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25"
            >
              {days.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/25 px-4 py-2.5 text-[11px] text-white/55">
                  No logged time this month yet
                </div>
              ) : (
                days.map((day) => {
                  const displayFormatted =
                    day.isToday && isRunning ? todayLiveFormatted : day.totalFormatted;
                  const displayMinutes = capDayMinutes(day.totalMinutes);

                  return (
                    <div
                      key={day.date}
                      className={cn(
                        'flex min-w-[72px] shrink-0 flex-col items-center justify-center rounded-lg border px-2.5 py-2 text-center',
                        day.isToday
                          ? 'border-teal-300/70 bg-teal-500/30 ring-1 ring-teal-400/40'
                          : 'border-white/15 bg-white/[0.07] hover:bg-white/12',
                      )}
                      title={day.date}
                    >
                      <span
                        className={cn(
                          'text-[9px] font-bold uppercase leading-tight',
                          day.isToday ? 'text-teal-100' : 'text-white/60',
                        )}
                      >
                        {day.dayLabel}
                      </span>
                      <span
                        className={cn(
                          'mt-1 font-mono text-sm font-bold tabular-nums leading-none',
                          day.isToday ? 'text-white' : 'text-white/95',
                        )}
                      >
                        {displayFormatted}
                      </span>
                      {displayMinutes >= MAX_DAY_MINUTES && (
                        <span className="mt-0.5 text-[8px] text-amber-200/90">max day</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="hidden w-px shrink-0 bg-white/15 xl:block" />

        {/* Month total */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-white/10 pt-2 xl:flex-col xl:items-end xl:justify-center xl:border-t-0 xl:pt-0 xl:min-w-[100px]">
          <div className="xl:text-right">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/50 xl:justify-end">
              <Clock className="h-3 w-3" />
              Month
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums leading-none text-teal-200">
              {monthlyFormatted}
            </p>
            {periodLabel && (
              <p className="mt-1 text-[10px] text-white/55">{periodLabel}</p>
            )}
          </div>
          <span
            className={cn(
              'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold',
              isRunning ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white/60',
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
    </div>
  );
}
