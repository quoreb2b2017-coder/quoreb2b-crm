'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ANNUAL_PAID_LEAVE_ALLOWANCE } from '@/lib/attendance/leave-balance';
import { xlHeaderClass, xlScrollClass } from '@/lib/attendance/xl-sheet-theme';

export interface AttendanceStatItem {
  label: string;
  value: string | number;
  tone?: 'green' | 'red' | 'blue' | 'neutral' | 'violet';
  checkHistoryHref?: string;
  onCheckHistory?: () => void;
}

const toneValue: Record<string, string> = {
  green: 'text-[#217346]',
  red: 'text-[#c00000]',
  blue: 'text-[#2e75b6]',
  violet: 'text-violet-700',
  neutral: 'text-slate-900',
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

function XlSheetHeader({
  title,
  variant = 'green',
  meta,
}: {
  title: string;
  variant?: 'green' | 'violet';
  meta?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-between px-3 py-1.5 text-white',
        xlHeaderClass(variant),
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[9px] font-bold tracking-tight">
          XL
        </span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      {meta && <span className="text-[11px] text-white/75">{meta}</span>}
    </div>
  );
}

function AttendanceMetric({ stat, index }: { stat: AttendanceStatItem; index: number }) {
  const tone = stat.tone ?? 'neutral';
  const showHistory =
    (stat.checkHistoryHref || stat.onCheckHistory) &&
    stat.label.toLowerCase().includes('present');

  return (
    <div
      className={cn(
        'flex min-h-[76px] flex-1 flex-col justify-center border-r border-[#e0e0e0] px-3 py-3 text-center last:border-r-0',
        'transition-colors duration-150 ease-out hover:bg-[#e7f3ff]/40',
        index % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]',
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{stat.label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums leading-none', toneValue[tone])}>
        {stat.value}
      </p>
      {showHistory &&
        (stat.checkHistoryHref ? (
          <a
            href={stat.checkHistoryHref}
            className="mt-2 inline-flex items-center justify-center gap-0.5 text-[11px] font-semibold text-[#217346] hover:underline"
          >
            View history <ChevronRight className="h-3 w-3" />
          </a>
        ) : (
          <button
            type="button"
            onClick={stat.onCheckHistory}
            className="mt-2 text-[11px] font-semibold text-[#217346] hover:underline"
          >
            View history →
          </button>
        ))}
    </div>
  );
}

function PaidLeaveXlPanel({ stats }: { stats: AttendanceStatItem[] }) {
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
    { label: 'Paid used', value: used, tone: 'text-[#2e75b6]' },
    { label: 'Remaining', value: remaining, tone: 'text-[#217346]' },
    { label: 'Unpaid used', value: unpaid, tone: 'text-[#c00000]' },
  ];

  return (
    <div className="overflow-hidden border border-[#b4b4b4] bg-[#e6e6e6] shadow-sm transition-shadow duration-200 hover:shadow-md sm:rounded-sm">
      <XlSheetHeader
        title="Paid leave balance"
        variant="violet"
        meta={`Jan – Dec · ${allowance} days`}
      />
      <div className="border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 py-1.5 text-[11px] text-slate-600">
        Auto-updates when leave is approved
      </div>
      <div className="grid grid-cols-2 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] md:grid-cols-4">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn(
              'px-3 py-3 text-center transition-colors duration-150 hover:bg-[#ede9fe]/50',
              i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]',
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{cell.label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', cell.tone)}>{cell.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white px-3 py-2.5">
        <div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>Used {used} ({usedPct}%)</span>
          <span className="text-[#217346]">{remaining} remaining</span>
        </div>
        <div className="h-2 overflow-hidden rounded-sm border border-[#e0e0e0] bg-[#f2f2f2]">
          <div
            className="h-full bg-gradient-to-r from-[#217346] to-[#2e9b5f] transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, usedPct)}%` }}
          />
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
    <div
      className={cn(
        'xl-stagger w-full space-y-3',
        loading && 'pointer-events-none opacity-70',
        className,
      )}
    >
      {attendance.length > 0 && (
        <div className="overflow-hidden border border-[#b4b4b4] bg-[#e6e6e6] shadow-sm transition-shadow duration-200 hover:shadow-md sm:rounded-sm">
          <XlSheetHeader title="Attendance summary" meta={`${attendance.length} metrics`} />
          <div className="flex flex-wrap sm:flex-nowrap">
            {attendance.map((stat, i) => (
              <AttendanceMetric key={stat.label} stat={stat} index={i} />
            ))}
          </div>
        </div>
      )}

      {paidLeave.length > 0 && <PaidLeaveXlPanel stats={paidLeave} />}
    </div>
  );
}
