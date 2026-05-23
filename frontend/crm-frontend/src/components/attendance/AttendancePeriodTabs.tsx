'use client';

import { CalendarDays, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type AttendancePeriodView = 'monthly' | 'yearly';

interface AttendancePeriodTabsProps {
  view: AttendancePeriodView;
  onChange: (view: AttendancePeriodView) => void;
  className?: string;
}

export function AttendancePeriodTabs({ view, onChange, className }: AttendancePeriodTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-sm',
        className,
      )}
      role="tablist"
      aria-label="Attendance period"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'monthly'}
        onClick={() => onChange('monthly')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
          view === 'monthly'
            ? 'bg-white text-[#217346] shadow-sm ring-1 ring-slate-200/80'
            : 'text-slate-600 hover:text-slate-900',
        )}
      >
        <CalendarDays className="h-4 w-4" />
        Monthly
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'yearly'}
        onClick={() => onChange('yearly')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
          view === 'yearly'
            ? 'bg-white text-[#217346] shadow-sm ring-1 ring-slate-200/80'
            : 'text-slate-600 hover:text-slate-900',
        )}
      >
        <CalendarRange className="h-4 w-4" />
        Yearly
      </button>
    </div>
  );
}
