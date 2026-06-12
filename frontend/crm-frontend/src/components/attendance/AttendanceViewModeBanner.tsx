'use client';

import { CalendarDays, CalendarRange, Layers } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import {
  formatSelectedMonthsShort,
  periodViewDescription,
  periodViewTitle,
} from '@/lib/attendance/period-labels';
import { AttendanceSelectedMonthsChips } from '@/components/attendance/AttendanceSelectedMonthsChips';

type Accent = 'emerald' | 'violet' | 'admin';

const accentStyles: Record<
  Accent,
  { wrap: string; icon: string; title: string; badge: string }
> = {
  emerald: {
    wrap: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50',
    icon: 'bg-emerald-100 text-emerald-700',
    title: 'text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
  violet: {
    wrap: 'border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50',
    icon: 'bg-violet-100 text-violet-700',
    title: 'text-violet-900',
    badge: 'bg-violet-100 text-violet-800 ring-violet-200',
  },
  admin: {
    wrap: 'border-[#217346]/20 bg-gradient-to-r from-[#e8f5ee] to-emerald-50',
    icon: 'bg-[#217346]/10 text-[#217346]',
    title: 'text-[#1a5c38]',
    badge: 'bg-[#217346]/10 text-[#217346] ring-[#217346]/20',
  },
};

interface AttendanceViewModeBannerProps {
  view: AttendancePeriodView;
  year: number;
  monthLabel: string;
  selectedMonths: number[];
  accent?: Accent;
  className?: string;
}

export function AttendanceViewModeBanner({
  view,
  year,
  monthLabel,
  selectedMonths,
  accent = 'emerald',
  className,
}: AttendanceViewModeBannerProps) {
  const styles = accentStyles[accent];
  const Icon = view === 'yearly' ? CalendarRange : view === 'custom' ? Layers : CalendarDays;
  const modeLabel =
    view === 'yearly' ? 'Full year' : view === 'custom' ? 'Multi-month' : 'One month';

  return (
    <div
      className={cn(
        'w-full rounded-xl border px-4 py-3 shadow-sm',
        styles.wrap,
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1',
                styles.badge,
              )}
            >
              {modeLabel}
            </span>
            <h2 className={cn('text-sm font-bold sm:text-base', styles.title)}>
              {periodViewTitle(view, year, monthLabel, selectedMonths)}
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            {periodViewDescription(view)}
          </p>
          {view === 'custom' && (
            <div className="mt-2 space-y-2">
              {selectedMonths.length < 2 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Open the month picker → tick 2 or more months → click Apply
                </p>
              )}
              <AttendanceSelectedMonthsChips months={selectedMonths} accent={accent} />
            </div>
          )}
          {view === 'yearly' && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              Jan – Dec {year} in one table. Year total = sum of all 12 months (not just one month).
              Click a month row to open its daily log.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
