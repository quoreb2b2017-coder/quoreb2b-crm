'use client';

import { CalendarDays, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type AttendancePeriodView = 'monthly' | 'yearly' | 'custom';
export type AttendancePeriodAccent = 'emerald' | 'violet' | 'admin';

const activeTabClass: Record<AttendancePeriodAccent, string> = {
  emerald: 'bg-white text-[#2e7ad1] shadow-sm ring-1 ring-slate-200/80',
  violet: 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200/80',
  admin: 'bg-white text-[#2e7ad1] shadow-sm ring-1 ring-slate-200/80',
};

interface AttendancePeriodTabsProps {
  view: AttendancePeriodView;
  onChange: (view: AttendancePeriodView) => void;
  accent?: AttendancePeriodAccent;
  className?: string;
}

export function AttendancePeriodTabs({
  view,
  onChange,
  accent = 'admin',
  className,
}: AttendancePeriodTabsProps) {
  const active = activeTabClass[accent];

  return (
    <div
      className={cn(
        'relative z-20 inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-sm',
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
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4',
          view === 'monthly' ? active : 'text-slate-600 hover:text-slate-900',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">One month</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'yearly'}
        onClick={() => onChange('yearly')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4',
          view === 'yearly' ? active : 'text-slate-600 hover:text-slate-900',
        )}
      >
        <CalendarRange className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">All 12 months</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'custom'}
        onClick={() => onChange('custom')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4',
          view === 'custom' ? active : 'text-slate-600 hover:text-slate-900',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">Custom</span>
      </button>
    </div>
  );
}
