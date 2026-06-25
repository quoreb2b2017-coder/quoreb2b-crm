'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { spreadsheetGuardProps } from '@/lib/spreadsheet/spreadsheet-access';
import { useCanExportSpreadsheet, useShowSpreadsheetRestrictionHint } from '@/hooks/useSpreadsheetCopyGuard';

interface ExcelSheetShellProps {
  title: string;
  rowCount?: number;
  /** Singular label for the count badge (default: row → rows) */
  countUnit?: string;
  loading?: boolean;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  headerVariant?: 'green' | 'violet';
}

export function ExcelSheetShell({
  title,
  rowCount,
  countUnit = 'row',
  loading,
  toolbar,
  children,
  className,
  hint = 'Navigate cells (Excel style)',
  headerVariant = 'green',
}: ExcelSheetShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const canExport = useCanExportSpreadsheet();
  const showRestrictionHint = useShowSpreadsheetRestrictionHint();

  const headerClass =
    headerVariant === 'violet'
      ? 'bg-gradient-to-r from-violet-700 via-purple-700 to-violet-800'
      : 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700';

  return (
    <div
      {...spreadsheetGuardProps}
      className={cn(
        'flex min-h-0 w-full max-w-none self-stretch flex-col overflow-hidden',
        'border border-slate-200/90 bg-white/95 backdrop-blur',
        'rounded-xl shadow-sm transition-all duration-200 hover:shadow-md',
        !canExport && 'select-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-3 py-2 text-white',
          headerClass,
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[9px] font-bold tracking-tight ring-1 ring-white/25">
            XL
          </span>
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <span className="text-[11px] text-white/80">
          {loading
            ? 'Loading…'
            : rowCount != null
              ? `${rowCount} ${rowCount === 1 ? countUnit : `${countUnit}s`}`
              : ''}
        </span>
      </div>

      {(toolbar || hint) && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
          {toolbar}
          {hint && (
            <>
              {toolbar && <span className="text-slate-300">|</span>}
              <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-200/80 px-1.5 py-0.5 font-medium text-slate-600">
                ↑ ↓ ← →
              </span>
              <span>{hint}</span>
              {showRestrictionHint && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-amber-800">Copy/download restricted — paste shows ++++++</span>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div ref={contentRef} className="min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}
