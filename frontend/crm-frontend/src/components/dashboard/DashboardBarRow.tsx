'use client';

import { cn } from '@/lib/utils/cn';

export function DashboardBarRow({
  label,
  count,
  total,
  color,
  delay = 0,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  delay?: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="dash-bar-row">
      <div className="mb-1.5 flex justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-600">{label}</span>
        <span className="shrink-0 font-mono text-[11px] font-bold text-slate-800">
          {count.toLocaleString('en-US')}
          <span className="ml-1 font-normal text-slate-400">({pct}%)</span>
        </span>
      </div>
      <div className="dash-bar-track">
        <div
          className={cn('dash-bar-fill', color)}
          style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
        />
      </div>
    </div>
  );
}
