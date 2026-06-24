'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[85]" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-[90] w-[min(240px,90vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        style={{ left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 220) }}
        role="menu"
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
      </div>
    </>
  );
}
