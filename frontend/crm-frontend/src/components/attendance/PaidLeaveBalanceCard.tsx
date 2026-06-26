'use client';

import './attendance.css';

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
    <div className={cn('att-sheet', className)}>
      <div className="att-sheet__head">
        <div className="flex items-center gap-1.5">
          <span className="att-sheet__head-badge">PL</span>
          <span>Paid leave {year}</span>
        </div>
        {!compact && !loading && (
          <span className="att-sheet__meta">{remaining} left</span>
        )}
      </div>

      {!compact && (
        <div className="att-sheet__note">January – December · {total} days per year</div>
      )}

      <div className="grid grid-cols-3 divide-x divide-slate-100 bg-white">
        {cells.map((cell) => (
          <div key={cell.label} className="att-leave-cell">
            <p className="att-leave-cell__label">{cell.label}</p>
            <p className={cn('att-leave-cell__value', cell.color)}>{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="att-progress">
        <div className="att-progress__labels">
          <span>{usedPct}% used</span>
          <span className="text-[#2e7ad1]">{remaining} remaining</span>
        </div>
        <div className="att-progress__track">
          <div className="att-progress__fill" style={{ width: `${usedPct}%` }} />
        </div>
      </div>
    </div>
  );
}
