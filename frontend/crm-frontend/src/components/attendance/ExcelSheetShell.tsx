'use client';

import { cn } from '@/lib/utils/cn';

interface ExcelSheetShellProps {
  title: string;
  rowCount?: number;
  loading?: boolean;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

export function ExcelSheetShell({
  title,
  rowCount,
  loading,
  toolbar,
  children,
  className,
  hint = 'Navigate cells (Excel style)',
}: ExcelSheetShellProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 w-full max-w-none self-stretch flex-col overflow-hidden border-x-0 border-y border-[#b4b4b4] bg-[#e6e6e6] sm:border',
        className,
      )}
    >
      <div className="flex flex-shrink-0 items-center justify-between bg-[#217346] px-3 py-1.5 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[9px] font-bold">
            XL
          </span>
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <span className="text-[11px] text-white/80">
          {loading ? 'Loading…' : rowCount != null ? `${rowCount} row${rowCount !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {(toolbar || hint) && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 py-1.5 text-xs text-slate-600">
          {toolbar}
          {hint && (
            <>
              {toolbar && <span className="text-slate-300">|</span>}
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-200/80 px-1 font-medium text-slate-600">
                ↑ ↓ ← →
              </span>
              <span>{hint}</span>
            </>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
