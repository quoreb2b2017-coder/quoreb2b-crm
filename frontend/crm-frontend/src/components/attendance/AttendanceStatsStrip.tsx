'use client';

import './attendance.css';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ANNUAL_PAID_LEAVE_ALLOWANCE } from '@/lib/attendance/leave-balance';

export interface AttendanceStatItem {
  label: string;
  value: string | number;
  tone?: 'green' | 'red' | 'blue' | 'neutral' | 'violet';
  checkHistoryHref?: string;
  onCheckHistory?: () => void;
}

const toneClass: Record<string, string> = {
  green: 'att-metric__value--green',
  red: 'att-metric__value--red',
  blue: 'att-metric__value--blue',
  violet: 'att-metric__value--violet',
  neutral: 'att-metric__value--neutral',
};

function isPaidLeaveStat(label: string) {
  const l = label.toLowerCase();
  return l.includes('paid') || l.includes('unpaid');
}

function splitStats(stats: AttendanceStatItem[]) {
  const attendance: AttendanceStatItem[] = [];
  const paidLeave: AttendanceStatItem[] = [];
  for (const stat of stats) {
    if (isPaidLeaveStat(stat.label)) paidLeave.push(stat);
    else attendance.push(stat);
  }
  return { attendance, paidLeave };
}

function AttendanceMetric({ stat, index }: { stat: AttendanceStatItem; index: number }) {
  const tone = stat.tone ?? 'neutral';
  const showHistory =
    (stat.checkHistoryHref || stat.onCheckHistory) &&
    stat.label.toLowerCase().includes('present');

  return (
    <div className="att-metric" style={{ animationDelay: `${index * 35}ms` }}>
      <p className="att-metric__label">{stat.label}</p>
      <p className={cn('att-metric__value', toneClass[tone])}>{stat.value}</p>
      {showHistory &&
        (stat.checkHistoryHref ? (
          <a href={stat.checkHistoryHref} className="att-metric__link inline-flex items-center gap-0.5">
            View history <ChevronRight className="h-3 w-3" />
          </a>
        ) : (
          <button type="button" onClick={stat.onCheckHistory} className="att-metric__link">
            View history →
          </button>
        ))}
    </div>
  );
}

function PaidLeavePanel({ stats }: { stats: AttendanceStatItem[] }) {
  const total =
    stats.find((s) => s.label.toLowerCase().includes('total paid'))?.value ??
    ANNUAL_PAID_LEAVE_ALLOWANCE;
  const used = Number(stats.find((s) => s.label.toLowerCase().includes('paid used'))?.value ?? 0);
  const remaining = Number(
    stats.find((s) => s.label.toLowerCase().includes('remaining'))?.value ??
      ANNUAL_PAID_LEAVE_ALLOWANCE,
  );
  const unpaid = Number(stats.find((s) => s.label.toLowerCase().includes('unpaid'))?.value ?? 0);
  const allowance = Number(total) || ANNUAL_PAID_LEAVE_ALLOWANCE;
  const usedPct = allowance > 0 ? Math.round((used / allowance) * 100) : 0;

  const cells = [
    { label: 'Total paid', value: allowance, tone: 'text-slate-900' },
    { label: 'Paid used', value: used, tone: 'text-[#2568b8]' },
    { label: 'Remaining', value: remaining, tone: 'text-[#2e7ad1]' },
    { label: 'Unpaid used', value: unpaid, tone: 'text-[#c00000]' },
  ];

  return (
    <div className="att-sheet">
      <div className="att-sheet__head">
        <div className="flex items-center gap-1.5">
          <span className="att-sheet__head-badge">PL</span>
          <span>Paid leave balance</span>
        </div>
        <span className="att-sheet__meta">Jan – Dec · {allowance} days</span>
      </div>
      <div className="att-sheet__note">Auto-updates when leave is approved</div>
      <div className="att-leave-grid">
        {cells.map((cell) => (
          <div key={cell.label} className="att-leave-cell">
            <p className="att-leave-cell__label">{cell.label}</p>
            <p className={cn('att-leave-cell__value', cell.tone)}>{cell.value}</p>
          </div>
        ))}
      </div>
      <div className="att-progress">
        <div className="att-progress__labels">
          <span>Used {used} ({usedPct}%)</span>
          <span className="text-[#2e7ad1]">{remaining} remaining</span>
        </div>
        <div className="att-progress__track">
          <div className="att-progress__fill" style={{ width: `${Math.min(100, usedPct)}%` }} />
        </div>
      </div>
    </div>
  );
}

interface AttendanceStatsStripProps {
  stats: AttendanceStatItem[];
  loading?: boolean;
  perRow?: number;
  className?: string;
}

export function AttendanceStatsStrip({
  stats,
  loading,
  className,
}: AttendanceStatsStripProps) {
  if (!stats.length) return null;

  const { attendance, paidLeave } = splitStats(stats);

  return (
    <div className={cn('att-stats-wrap', loading && 'pointer-events-none opacity-70', className)}>
      {attendance.length > 0 && (
        <div className="att-sheet">
          <div className="att-sheet__head">
            <div className="flex items-center gap-1.5">
              <span className="att-sheet__head-badge">XL</span>
              <span>Attendance summary</span>
            </div>
            <span className="att-sheet__meta">{attendance.length} metrics</span>
          </div>
          <div className="att-metrics-row">
            {attendance.map((stat, i) => (
              <AttendanceMetric key={stat.label} stat={stat} index={i} />
            ))}
          </div>
        </div>
      )}

      {paidLeave.length > 0 && <PaidLeavePanel stats={paidLeave} />}
    </div>
  );
}
