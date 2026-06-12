'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MONTHS } from '@/lib/attendance/month-year';
import { ALL_MONTH_INDICES } from '@/lib/attendance/yearly-analytics';

type Accent = 'emerald' | 'violet' | 'admin';

const focusRing: Record<Accent, string> = {
  emerald: 'focus:ring-emerald-500/40',
  violet: 'focus:ring-violet-500/40',
  admin: 'focus:ring-[#217346]/40',
};

interface AttendanceMonthMultiPickerProps {
  selectedMonths: number[];
  onApply: (months: number[]) => void;
  onSelectFullYear: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  accent?: Accent;
  className?: string;
}

function labelForMonths(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  if (sorted.length >= 12) return 'All 12 months';
  if (sorted.length === 1) return MONTHS[sorted[0] - 1];
  if (sorted.length <= 3) {
    return sorted.map((m) => MONTHS[m - 1].slice(0, 3)).join(', ');
  }
  return `${sorted.length} months selected`;
}

function isFullYearSelection(months: number[]): boolean {
  if (months.length < 12) return false;
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  return ALL_MONTH_INDICES.every((m, i) => sorted[i] === m);
}

export function AttendanceMonthMultiPicker({
  selectedMonths,
  onApply,
  onSelectFullYear,
  open: openProp,
  onOpenChange,
  accent = 'emerald',
  className,
}: AttendanceMonthMultiPickerProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    else setOpenInternal(value);
  };

  const [draft, setDraft] = useState<number[]>([...selectedMonths]);
  const rootRef = useRef<HTMLDivElement>(null);

  // When picker opens, initialize draft with selectedMonths
  useEffect(() => {
    if (open) {
      setDraft([...selectedMonths]);
    }
  }, [open, selectedMonths]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener('click', onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDoc);
    };
  }, [open, setOpen]);

  const toggle = (month: number) => {
    setDraft((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month].sort((a, b) => a - b),
    );
  };

  const selectAllDraft = () => {
    setDraft([...ALL_MONTH_INDICES]);
  };

  const clearDraft = () => {
    setDraft([]);
  };

  const applyFullYear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpen(false);
    onSelectFullYear();
  };

  const apply = () => {
    if (draft.length === 0) return;
    if (isFullYearSelection(draft)) {
      applyFullYear();
      return;
    }
    onApply(draft);
    setOpen(false);
  };

  const ring = focusRing[accent];
  const allDraftSelected = isFullYearSelection(draft);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex min-w-[148px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2',
          ring,
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{labelForMonths(selectedMonths)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[min(100vw-2rem,280px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Select month(s) — tick multiple
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllDraft}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={(e) => applyFullYear(e)}
              className="rounded-md border border-[#217346] bg-[#217346] px-2 py-1 text-xs font-semibold text-white hover:bg-[#1a5c38]"
            >
              All 12 & apply
            </button>
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-[240px] overflow-y-auto space-y-1" role="listbox" aria-multiselectable>
            {MONTHS.map((name, i) => {
              const month = i + 1;
              const checked = draft.includes(month);
              return (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(month)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50',
                      checked && 'bg-emerald-50/80 font-medium text-emerald-900',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {name}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={draft.length === 0}
              onClick={apply}
              className="rounded-lg bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {allDraftSelected ? 'Apply all 12' : `Apply (${draft.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
