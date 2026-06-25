import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDurationFromMinutes } from '@/lib/api/work-time.service';

export function WorkDurationCell({
  minutes,
  targetMinutes,
  targetLabel,
  met,
  inProgress,
  liveSeconds,
  variant = 'net',
}: {
  minutes?: number;
  targetMinutes: number;
  targetLabel: string;
  met?: boolean;
  inProgress?: boolean;
  liveSeconds?: number;
  /** gross = login span (9h incl. breaks); net = working time (7h 45m) — green tick only on net */
  variant?: 'gross' | 'net';
}) {
  const value = minutes ?? 0;
  const hasActivity = value > 0 || inProgress || (liveSeconds ?? 0) > 0;
  const isNet = variant === 'net';

  if (!hasActivity) {
    return <span className="text-slate-400">—</span>;
  }

  const formatted = formatDurationFromMinutes(value);
  const targetReached = met ?? value >= targetMinutes;
  const showGreenTick = isNet && targetReached;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {showGreenTick && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#2e7ad1]" aria-hidden />
        )}
        <span
          className={cn(
            'font-mono text-[12px] font-semibold tabular-nums',
            showGreenTick && 'text-[#2e7ad1]',
            !showGreenTick && inProgress && 'text-amber-800',
          )}
        >
          {formatted}
        </span>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide',
          showGreenTick
            ? 'bg-emerald-100 text-[#2568b8]'
            : inProgress
              ? 'bg-amber-100 text-amber-800'
              : targetReached && !isNet
                ? 'bg-sky-100 text-sky-800'
                : 'bg-slate-100 text-slate-600',
        )}
      >
        {showGreenTick ? (
          'Complete'
        ) : inProgress ? (
          <>
            <Clock className="h-2.5 w-2.5 animate-pulse" />
            Live
          </>
        ) : targetReached && !isNet ? (
          'Shift full'
        ) : (
          `Target ${targetLabel}`
        )}
      </span>
    </div>
  );
}
