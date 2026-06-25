'use client';

import { usePaidLeaveBalance } from '@/hooks/usePaidLeaveBalance';
import { cn } from '@/lib/utils/cn';
import { ANNUAL_PAID_LEAVE_ALLOWANCE } from '@/lib/attendance/leave-balance';

interface PaidLeaveBalanceCardProps {
  year?: number;
  className?: string;
  compact?: boolean;
}

export function PaidLeaveBalanceCard({
  year = new Date().getFullYear(),
  className,
  compact,
}: PaidLeaveBalanceCardProps) {
  const { allowance, used, remaining, loading } = usePaidLeaveBalance(year);
  const total = allowance || ANNUAL_PAID_LEAVE_ALLOWANCE;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const cells = [
    { label: 'Total', value: total, color: 'text-slate-900' },
    { label: 'Used', value: loading ? '—' : used, color: 'text-[#2568b8]' },
    { label: 'Left', value: loading ? '—' : remaining, color: 'text-[#2e7ad1]' },
  ];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-all duration-200 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-[#2568b8] to-[#2e7ad1] px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[9px] font-bold">
            PL
          </span>
          <span className="text-xs font-semibold">Paid leave {year}</span>
        </div>
        {!compact && !loading && (
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold">
            {remaining} left
          </span>
        )}
      </div>

      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[11px] text-slate-600">
        January – December · {total} days per year
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 bg-white">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn(
              'px-2 py-3 text-center transition-colors duration-150 hover:bg-[#e8f1fb]/40',
              i === 1 && 'bg-slate-50/50',
            )}
          >
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{cell.label}</p>
            <p className={cn('mt-0.5 text-lg font-bold tabular-nums', cell.color)}>{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 bg-white px-4 py-2.5">
        <div className="mb-1.5 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>{usedPct}% used</span>
          <span className="text-[#2e7ad1]">{remaining} remaining</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2568b8] to-[#2e7ad1] transition-all duration-500 ease-out"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
