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
    { label: 'Used', value: loading ? '—' : used, color: 'text-[#2e75b6]' },
    { label: 'Left', value: loading ? '—' : remaining, color: 'text-[#217346]' },
  ];

  return (
    <div
      className={cn(
        'overflow-hidden border border-[#b4b4b4] bg-[#e6e6e6] shadow-sm transition-all duration-200 hover:shadow-md sm:rounded-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-700 to-purple-800 px-3 py-1.5 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[9px] font-bold">
            XL
          </span>
          <span className="text-xs font-semibold">Paid leave {year}</span>
        </div>
        {!compact && !loading && (
          <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
            {remaining} left
          </span>
        )}
      </div>

      <div className="border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 py-1 text-[11px] text-slate-600">
        January – December · {total} days per year
      </div>

      <div className="grid grid-cols-3 divide-x divide-[#e0e0e0] bg-white">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn(
              'px-2 py-2.5 text-center transition-colors duration-150 hover:bg-violet-50/50',
              i === 1 && 'bg-[#fafafa]',
            )}
          >
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{cell.label}</p>
            <p className={cn('mt-0.5 text-lg font-bold tabular-nums', cell.color)}>{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#e0e0e0] bg-white px-3 py-2">
        <div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>{usedPct}% used</span>
          <span className="text-[#217346]">{remaining} remaining</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm border border-[#e0e0e0] bg-[#f2f2f2]">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-[#217346] transition-all duration-500 ease-out"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
