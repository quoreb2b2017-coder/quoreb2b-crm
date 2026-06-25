'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

import {
  MONTHS,
  buildYearOptions,
  formatMonthYearLabel,
  getCurrentMonthYear,
  shiftMonth,
} from '@/lib/attendance/month-year';

import { AttendanceMonthMultiPicker } from '@/components/attendance/AttendanceMonthMultiPicker';

import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';

import { formatSelectedMonthsShort as formatSelectedShort } from '@/lib/attendance/period-labels';

type Accent = 'emerald' | 'violet' | 'admin';

const focusRing: Record<Accent, string> = {
  emerald: 'focus:ring-[#2e7ad1]/40',
  violet: 'focus:ring-violet-500/40',
  admin: 'focus:ring-[#2e7ad1]/40',
};

interface AttendanceMonthYearNavProps {
  month: number;
  year: number;
  selectedMonths?: number[];
  onChange: (month: number, year: number) => void;
  view?: AttendancePeriodView;
  onMonthsApply?: (months: number[]) => void;
  onSelectFullYear?: () => void;
  accent?: Accent;
  showToday?: boolean;
  className?: string;
}

export function AttendanceMonthYearNav({
  month,
  year,
  selectedMonths: selectedMonthsProp,
  view: viewProp,
  onChange,
  onMonthsApply,
  onSelectFullYear,
  accent = 'emerald',
  showToday = true,
  className,
}: AttendanceMonthYearNavProps) {
  const view = viewProp ?? 'monthly';
  const selectedMonths = selectedMonthsProp ?? [month];
  const years = buildYearOptions(year);
  const ring = focusRing[accent];

  const selectClass = cn(
    'rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-2',
    ring,
  );

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();

  const isRollup = view === 'yearly' || view === 'custom';

  const isCurrentPeriod = isRollup
    ? year === todayYear
    : month === todayMonth && year === todayYear;

  const showTodayButton = showToday && !isCurrentPeriod;

  const goPrev = () => {
    if (isRollup) {
      onChange(month, year - 1);
      return;
    }

    const next = shiftMonth(year, month, -1);
    onChange(next.month, next.year);
  };

  const goNext = () => {
    if (isRollup) {
      onChange(month, year + 1);
      return;
    }

    const next = shiftMonth(year, month, 1);
    onChange(next.month, next.year);
  };

  const goToday = () => {
    onChange(todayMonth, todayYear);
  };

  const periodHint = isRollup
    ? view === 'yearly'
      ? `Full year ${year}`
      : `${formatSelectedShort(selectedMonths)} · ${year}`
    : formatMonthYearLabel(month, year);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={goPrev}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
          aria-label={isRollup ? 'Previous year' : 'Previous month'}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
          aria-label={isRollup ? 'Next year' : 'Next month'}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!isRollup ? (
        <select
          value={month}
          onChange={(e) => onChange(Number(e.target.value), year)}
          className={cn(selectClass, 'min-w-[128px]')}
          aria-label="Month"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      ) : onMonthsApply && onSelectFullYear ? (
        <AttendanceMonthMultiPicker
          selectedMonths={view === 'yearly' ? Array.from({ length: 12 }, (_, i) => i + 1) : selectedMonths}
          onApply={onMonthsApply}
          onSelectFullYear={onSelectFullYear}
          accent={accent}
        />
      ) : (
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700">
          All 12 months
        </span>
      )}

      <select
        value={year}
        onChange={(e) => onChange(month, Number(e.target.value))}
        className={selectClass}
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={goToday}
        tabIndex={showTodayButton ? 0 : -1}
        aria-hidden={!showTodayButton}
        className={cn(
          'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50',
          !showTodayButton && 'pointer-events-none invisible',
        )}
      >
        Today
      </button>

      <span className="ml-auto hidden text-xs font-medium text-slate-400 sm:inline">{periodHint}</span>
    </div>
  );
}
