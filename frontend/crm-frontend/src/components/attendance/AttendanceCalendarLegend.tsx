'use client';

import { cn } from '@/lib/utils/cn';
import {
  ATTENDANCE_LEGEND_ITEMS,
  ATTENDANCE_STATUS_COLORS,
} from '@/lib/attendance/attendance-calendar';

function StatusOrb({
  status,
  size = 'md',
  shape = 'circle',
}: {
  status: keyof typeof ATTENDANCE_STATUS_COLORS;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'rounded';
}) {
  const color = ATTENDANCE_STATUS_COLORS[status];
  const px = size === 'sm' ? 10 : size === 'lg' ? 16 : 13;

  return (
    <span
      className={cn(
        'inline-block shrink-0',
        shape === 'circle' ? 'rounded-full' : 'rounded-[4px]',
      )}
      style={{
        width: px,
        height: px,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), ${color} 58%, ${color})`,
        boxShadow: `inset 0 -2px 3px rgba(0,0,0,0.18), 0 1px 2px rgba(15,23,42,0.12)`,
      }}
      aria-hidden
    />
  );
}

interface AttendanceCalendarLegendProps {
  className?: string;
  compact?: boolean;
}

export function AttendanceCalendarLegend({ className, compact }: AttendanceCalendarLegendProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5',
        className,
      )}
    >
      {!compact && (
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Legend
        </span>
      )}
      {ATTENDANCE_LEGEND_ITEMS.map((item, index) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          {index > 0 && <span className="hidden text-slate-300 sm:inline" aria-hidden>|</span>}
          <StatusOrb status={item.status} size="sm" />
          <span className="text-[11px] font-medium text-slate-600">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export { StatusOrb };
