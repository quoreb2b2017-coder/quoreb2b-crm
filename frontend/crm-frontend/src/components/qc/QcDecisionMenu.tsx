'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { QcFixedPopover } from '@/components/qc/QcFixedPopover';

export type QcDecisionChoice = 'qualified' | 'tbd' | 'disqualified';

const OPTIONS: Array<{ id: QcDecisionChoice; label: string; desc: string; className: string }> = [
  {
    id: 'qualified',
    label: 'Qualified',
    desc: 'Send to Ready QC',
    className: 'hover:bg-emerald-50 text-emerald-800',
  },
  {
    id: 'tbd',
    label: 'TBD',
    desc: 'Return to employee My QC',
    className: 'hover:bg-amber-50 text-amber-900',
  },
  {
    id: 'disqualified',
    label: 'Disqualified',
    desc: 'Return to employee My QC',
    className: 'hover:bg-red-50 text-red-800',
  },
];

export function QcDecisionMenu({
  open,
  x,
  y,
  leadLabel,
  loading,
  onSelect,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  leadLabel?: string;
  loading?: boolean;
  onSelect: (decision: QcDecisionChoice) => void;
  onClose: () => void;
}) {
  return (
    <QcFixedPopover
      open={open}
      x={x}
      y={y}
      onClose={onClose}
      className="w-[min(240px,90vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
    >
      <div className="border-b border-slate-100 bg-violet-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">QC Status</p>
        {leadLabel && (
          <p className="truncate text-xs font-medium text-slate-700" title={leadLabel}>
            {leadLabel}
          </p>
        )}
      </div>
      <div className="p-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={loading}
            onClick={() => onSelect(opt.id)}
            className={cn(
              'flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition disabled:opacity-50',
              opt.className,
            )}
          >
            <span className="text-sm font-bold">{opt.label}</span>
            <span className="text-[10px] opacity-80">{opt.desc}</span>
          </button>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </div>
      )}
    </QcFixedPopover>
  );
}
