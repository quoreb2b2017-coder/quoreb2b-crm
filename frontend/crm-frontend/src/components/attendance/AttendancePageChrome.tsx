'use client';

import { CalendarDays, Plus, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import {
  AttendanceStatsStrip,
  type AttendanceStatItem,
} from '@/components/attendance/AttendanceStatsStrip';

type Accent = 'emerald' | 'violet' | 'admin';

const themes: Record<
  Accent,
  { hero: string; ring: string; btn: string; btnOutline: string; statAccent: string }
> = {
  admin: {
    hero: 'from-[#1a5c38] via-[#217346] to-[#0f2922]',
    ring: 'ring-emerald-500/20',
    btn: 'bg-white text-[#217346] hover:bg-emerald-50 shadow-md',
    btnOutline: 'border-white/35 text-white hover:bg-white/10',
    statAccent: 'border-l-[#217346]',
  },
  emerald: {
    hero: 'from-emerald-700 via-emerald-600 to-teal-800',
    ring: 'ring-emerald-500/20',
    btn: 'bg-white text-emerald-800 hover:bg-emerald-50 shadow-md',
    btnOutline: 'border-white/35 text-white hover:bg-white/10',
    statAccent: 'border-l-emerald-500',
  },
  violet: {
    hero: 'from-violet-700 via-violet-600 to-purple-900',
    ring: 'ring-violet-500/20',
    btn: 'bg-white text-violet-800 hover:bg-violet-50 shadow-md',
    btnOutline: 'border-white/35 text-white hover:bg-white/10',
    statAccent: 'border-l-violet-500',
  },
};

interface AttendancePageChromeProps {
  title: string;
  subtitle: string;
  accent: Accent;
  loading?: boolean;
  onRefresh: () => void;
  /** e.g. back button shown before the title icon */
  leading?: React.ReactNode;
  monthControl: React.ReactNode;
  /** Hide manual mark-today (employee: login auto-marks attendance). */
  showMarkToday?: boolean;
  stats?: AttendanceStatItem[];
  children: React.ReactNode;
}

export function AttendancePageChrome({
  title,
  subtitle,
  accent,
  loading,
  onRefresh,
  leading,
  monthControl,
  showMarkToday = true,
  stats,
  children,
}: AttendancePageChromeProps) {
  const panel = useAttendancePanelOptional();
  const t = themes[accent];

  return (
    <AttendanceFullBleed className="xl-stagger gap-4 px-3 py-4 sm:px-4 md:gap-5 animate-fade-in">
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-sm bg-gradient-to-br px-4 py-5 text-white shadow-md ring-1 sm:px-6',
          'transition-shadow duration-200 hover:shadow-lg',
          t.hero,
          t.ring,
        )}
      >
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {leading}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
              <p className="mt-0.5 max-w-lg text-sm text-white/80">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={cn(
                'rounded-lg border p-2.5 transition-all duration-150 ease-out hover:bg-white/15 active:scale-95',
                t.btnOutline,
              )}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            {panel && (
              <>
                {showMarkToday && (
                  <button
                    type="button"
                    onClick={panel.openMark}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                      t.btn,
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Mark Today
                  </button>
                )}
                <button
                  type="button"
                  onClick={panel.openLeave}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors',
                    t.btnOutline,
                  )}
                >
                  <FileText className="h-4 w-4" />
                  Apply Leave
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-none flex-wrap items-center gap-3 border border-[#b4b4b4] bg-[#f3f3f3] px-4 py-2.5 shadow-sm sm:rounded-sm">
        <span className="hidden items-center gap-1.5 rounded bg-[#217346] px-2 py-0.5 text-[10px] font-bold text-white sm:inline-flex">
          XL
        </span>
        {monthControl}
      </div>

      {stats && stats.length > 0 && (
        <AttendanceStatsStrip stats={stats} loading={loading} perRow={4} />
      )}

      <div className="flex min-h-0 w-full max-w-none min-w-0 flex-1 flex-col gap-4">
        {children}
      </div>
    </AttendanceFullBleed>
  );
}
