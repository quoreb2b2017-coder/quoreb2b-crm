'use client';

import { cn } from '@/lib/utils/cn';
import { monthChipLabel } from '@/lib/attendance/period-labels';

type Accent = 'emerald' | 'violet' | 'admin';

const chipClass: Record<Accent, string> = {
  emerald: 'bg-[#2e7ad1] text-white ring-emerald-700/30',
  violet: 'bg-[#2e7ad1] text-white ring-violet-700/30',
  admin: 'bg-[#2e7ad1] text-white ring-[#2568b8]/30',
};

interface AttendanceSelectedMonthsChipsProps {
  months: number[];
  accent?: Accent;
  className?: string;
}

export function AttendanceSelectedMonthsChips({
  months,
  accent = 'emerald',
  className,
}: AttendanceSelectedMonthsChipsProps) {
  const sorted = [...months].sort((a, b) => a - b);
  if (!sorted.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {sorted.map((m) => (
        <span
          key={m}
          className={cn(
            'inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1',
            chipClass[accent],
          )}
        >
          {monthChipLabel(m)}
        </span>
      ))}
    </div>
  );
}
