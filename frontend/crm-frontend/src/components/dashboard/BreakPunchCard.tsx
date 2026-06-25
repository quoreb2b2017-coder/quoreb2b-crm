'use client';

import { Coffee, UtensilsCrossed, Fingerprint, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useBreakPunch } from '@/hooks/useBreakPunch';
import {
  formatRemainingShort,
  type BreakType,
  type BreakTypeStatus,
} from '@/lib/api/break-punch.service';

type Accent = 'emerald' | 'violet' | 'admin';

const accentBtn: Record<Accent, string> = {
  emerald: 'bg-[#2e7ad1] hover:bg-[#2568b8] ring-[#2e7ad1]/20',
  violet: 'bg-[#2e7ad1] hover:bg-[#2568b8] ring-[#2e7ad1]/20',
  admin: 'bg-[#2e7ad1] hover:bg-[#2568b8] ring-[#2e7ad1]/20',
};

function CompactBreakTile({
  type,
  status,
  accent,
  icon: Icon,
  toggling,
  disabled,
  liveRemainingSeconds,
  onPunch,
}: {
  type: BreakType;
  status: BreakTypeStatus;
  accent: Accent;
  icon: typeof Coffee;
  toggling: BreakType | null;
  disabled: boolean;
  liveRemainingSeconds: number | null;
  onPunch: (type: BreakType) => void;
}) {
  const isTea = type === 'tea';
  const isActive = status.isActive;
  const isBusy = toggling === type;
  const locked = disabled && !isActive;
  const hasTime = status.remainingMinutes > 0 || isActive;

  const canPunch = isActive || (status.canStart && status.remainingMinutes > 0);

  const sublabel = isActive
    ? `On · ${formatRemainingShort(liveRemainingSeconds ?? status.remainingSeconds)} left`
    : status.remainingMinutes <= 0
      ? 'No time left'
      : `${status.remainingMinutes}m left · ${status.punchCount} punches`;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all sm:gap-3 sm:px-3',
        isTea
          ? 'border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-orange-50/50'
          : 'border-slate-200/70 bg-gradient-to-r from-[#e8f1fb]/90 to-white',
        isActive && 'border-rose-300/80 ring-1 ring-rose-200/80',
        locked && 'opacity-50',
        !hasTime && !isActive && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm',
          isTea ? 'bg-amber-100 text-amber-700' : 'bg-[#e8f1fb] text-[#2568b8]',
        )}
      >
        <Icon className="h-4 w-4" />
        {isActive && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-rose-500 ring-2 ring-white" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-800">{isTea ? 'Tea' : 'Lunch'}</span>
          <span className="rounded bg-white/80 px-1.5 py-px text-[9px] font-semibold text-slate-500 ring-1 ring-slate-200/80">
            {status.hint}
          </span>
        </div>
        <p
          className={cn(
            'truncate font-mono text-[10px] tabular-nums',
            isActive ? 'font-semibold text-rose-600' : 'text-slate-500',
          )}
        >
          {sublabel}
        </p>
      </div>

      <button
        type="button"
        disabled={locked || isBusy || !canPunch}
        onClick={() => onPunch(type)}
        title={isActive ? 'Punch in (end break)' : 'Punch out (start break)'}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm ring-1 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-[11px]',
          isActive ? 'bg-rose-500 hover:bg-rose-600 ring-rose-500/30' : accentBtn[accent],
        )}
      >
        <Fingerprint className={cn('h-3 w-3', isBusy && 'animate-pulse')} />
        {isBusy ? '…' : isActive ? 'In' : 'Out'}
      </button>
    </div>
  );
}

interface BreakPunchCardProps {
  accent?: Accent;
  className?: string;
}

export function BreakPunchCard({ accent = 'emerald', className }: BreakPunchCardProps) {
  const { data, loading, toggling, error, liveRemainingSeconds, toggle, reload } =
    useBreakPunch(true);

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm', className)}>
        <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  const otherActive = !!data.activeType;

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <Fingerprint className="h-3.5 w-3.5 text-slate-500" />
          Break punch
          <span className="hidden font-normal text-slate-400 sm:inline">
            · punch in/out until time runs out
          </span>
        </p>
        <button
          type="button"
          onClick={() => reload()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Sync
        </button>
      </div>

      {error && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <CompactBreakTile
          type="tea"
          status={data.tea}
          accent={accent}
          icon={Coffee}
          toggling={toggling}
          disabled={otherActive && data.activeType !== 'tea'}
          liveRemainingSeconds={data.activeType === 'tea' ? liveRemainingSeconds : null}
          onPunch={toggle}
        />
        <CompactBreakTile
          type="lunch"
          status={data.lunch}
          accent={accent}
          icon={UtensilsCrossed}
          toggling={toggling}
          disabled={otherActive && data.activeType !== 'lunch'}
          liveRemainingSeconds={data.activeType === 'lunch' ? liveRemainingSeconds : null}
          onPunch={toggle}
        />
      </div>
    </div>
  );
}
