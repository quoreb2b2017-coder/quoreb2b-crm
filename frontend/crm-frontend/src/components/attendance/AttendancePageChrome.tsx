'use client';

import { CalendarDays, Plus, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';

type Accent = 'emerald' | 'violet' | 'admin';

const themes: Record<
  Accent,
  { hero: string; ring: string; btn: string; btnOutline: string; stat: string }
> = {
  admin: {
    hero: 'from-[#1a5c38] via-[#217346] to-[#0d0f14]',
    ring: 'ring-emerald-500/30',
    btn: 'bg-white text-[#217346] hover:bg-emerald-50',
    btnOutline: 'border-white/30 text-white hover:bg-white/10',
    stat: 'text-[#217346]',
  },
  emerald: {
    hero: 'from-emerald-600/90 via-teal-600/80 to-[#0d0f14]',
    ring: 'ring-emerald-500/30',
    btn: 'bg-white text-emerald-800 hover:bg-emerald-50',
    btnOutline: 'border-white/30 text-white hover:bg-white/10',
    stat: 'text-emerald-600',
  },
  violet: {
    hero: 'from-violet-600/90 via-purple-600/75 to-[#0d0f14]',
    ring: 'ring-violet-500/30',
    btn: 'bg-white text-violet-800 hover:bg-violet-50',
    btnOutline: 'border-white/30 text-white hover:bg-white/10',
    stat: 'text-violet-600',
  },
};

interface AttendancePageChromeProps {
  title: string;
  subtitle: string;
  accent: Accent;
  loading?: boolean;
  onRefresh: () => void;
  monthControl: React.ReactNode;
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
  green: 'text-[#217346]',
  red: 'text-[#c00000]',
  blue: 'text-[#2e75b6]',
  neutral: 'text-slate-900',
};

export function AttendancePageChrome({
  title,
  subtitle,
  accent,
  loading,
  onRefresh,
  monthControl,
  stats,
  children,
}: AttendancePageChromeProps) {
  const panel = useAttendancePanelOptional();
  const t = themes[accent];

  return (
    <AttendanceFullBleed className="gap-4 py-3 sm:py-4 md:gap-5 animate-fade-in">
      <div
        className={cn(
          'relative mx-0 w-full overflow-hidden rounded-none sm:rounded-xl bg-gradient-to-br px-4 py-4 sm:px-5 sm:py-5 text-white shadow-lg ring-1',
          t.hero,
          t.ring,
        )}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
              <p className="mt-1 max-w-md text-sm text-white/75">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={cn('rounded-xl p-2.5 transition-colors', t.btnOutline, 'border')}
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            {panel && (
              <>
                <button
                  type="button"
                  onClick={panel.openMark}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-colors',
                    t.btn,
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Mark Today
                </button>
                <button
                  type="button"
                  onClick={panel.openLeave}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
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

      <div className="flex w-full max-w-none flex-wrap items-center gap-3 border-y border-slate-200/80 bg-white px-3 py-3 shadow-sm sm:rounded-xl sm:border sm:px-4">
        {monthControl}
      </div>

      {stats && stats.length > 0 && !loading && (
        <div className="grid w-full max-w-none grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-slate-200/80 bg-white px-3 py-3 shadow-sm sm:rounded-xl sm:px-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass[s.tone ?? 'neutral'])}>
                {s.value}
              </p>
              {(s.checkHistoryHref || s.onCheckHistory) && s.label === 'Present' && (
                s.checkHistoryHref ? (
                  <a
                    href={s.checkHistoryHref}
                    className="mt-1.5 inline-block text-xs font-semibold text-[#217346] underline decoration-[#217346]/40 underline-offset-2 hover:text-[#1a5c38]"
                  >
                    Check history
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={s.onCheckHistory}
                    className="mt-1.5 block text-xs font-semibold text-[#217346] underline decoration-[#217346]/40 underline-offset-2 hover:text-[#1a5c38]"
                  >
                    Check history
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 w-full max-w-none min-w-0 flex-1 flex-col gap-4 sm:gap-5">
        {children}
      </div>
    </AttendanceFullBleed>
  );
}
