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

const CRM_ATTENDANCE_THEME = {
  hero: 'from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8]',
  ring: 'ring-[#2e7ad1]/25',
  btn: 'bg-white text-[#2e7ad1] shadow-md hover:bg-[#e8f1fb] active:scale-[0.98]',
  btnOutline:
    'border-white/35 bg-white/10 text-white backdrop-blur-sm hover:bg-white/18 active:scale-[0.98]',
  statAccent: 'border-l-[#2e7ad1]',
};

const themes: Record<
  Accent,
  { hero: string; ring: string; btn: string; btnOutline: string; statAccent: string }
> = {
  admin: CRM_ATTENDANCE_THEME,
  emerald: CRM_ATTENDANCE_THEME,
  violet: CRM_ATTENDANCE_THEME,
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
          'relative w-full overflow-hidden rounded-2xl bg-gradient-to-br px-4 py-5 text-white shadow-crm ring-1 sm:px-6',
          'transition-all duration-200 ease-out hover:shadow-crm-lg',
          t.hero,
          t.ring,
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-40 rounded-full bg-[#1e5fa8]/40 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {leading}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm transition-transform duration-200 hover:scale-105">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
              <p className="mt-0.5 max-w-lg text-sm text-white/85">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={cn(
                'rounded-xl border p-2.5 transition-all duration-150 ease-out',
                t.btnOutline,
                loading && 'opacity-70',
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
                      'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150',
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
                    'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-150',
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

      <div className="flex w-full max-w-none flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-md">
        <span className="hidden items-center gap-1.5 rounded-md bg-[#2e7ad1] px-2 py-0.5 text-[10px] font-bold text-white sm:inline-flex">
          Period
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
