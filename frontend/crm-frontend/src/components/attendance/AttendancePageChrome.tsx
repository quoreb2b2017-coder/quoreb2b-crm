'use client';

import { CalendarDays, Plus, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';

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
  stats?: {
    label: string;
    value: string | number;
    tone?: 'green' | 'red' | 'blue' | 'neutral';
    checkHistoryHref?: string;
    onCheckHistory?: () => void;
  }[];
  children: React.ReactNode;
}

const toneClass = {
  green: 'text-emerald-700',
  red: 'text-rose-600',
  blue: 'text-blue-600',
  neutral: 'text-slate-900',
};

const toneBg = {
  green: 'bg-emerald-50/80',
  red: 'bg-rose-50/80',
  blue: 'bg-blue-50/80',
  neutral: 'bg-slate-50/80',
};

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
    <AttendanceFullBleed className="gap-4 px-3 py-4 sm:px-4 md:gap-5 animate-fade-in">
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl bg-gradient-to-br px-4 py-5 text-white shadow-lg ring-1 sm:px-6',
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
              className={cn('rounded-lg border p-2.5 transition-colors', t.btnOutline)}
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

      <div className="flex w-full max-w-none flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {monthControl}
      </div>

      {stats && stats.length > 0 && (
        <div
          className={cn(
            'grid w-full max-w-none grid-cols-2 gap-3 sm:grid-cols-4',
            loading && 'opacity-70',
          )}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className={cn(
                'rounded-xl border border-slate-200 border-l-[3px] bg-white px-4 py-3 shadow-sm',
                t.statAccent,
                toneBg[s.tone ?? 'neutral'],
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass[s.tone ?? 'neutral'])}>
                {s.value}
              </p>
              {(s.checkHistoryHref || s.onCheckHistory) &&
                (s.label === 'Present' || s.label.includes('present')) && (
                s.checkHistoryHref ? (
                  <a
                    href={s.checkHistoryHref}
                    className="mt-1.5 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    {s.label.toLowerCase().includes('year') ? 'View 12-month report' : 'View history'}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={s.onCheckHistory}
                    className="mt-1.5 block text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    View history
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 w-full max-w-none min-w-0 flex-1 flex-col gap-4">
        {children}
      </div>
    </AttendanceFullBleed>
  );
}
