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
  headerVariant?: 'green' | 'violet' | 'blue';
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
  headerVariant = 'blue',
}: ExcelSheetShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const canExport = useCanExportSpreadsheet();
  const showRestrictionHint = useShowSpreadsheetRestrictionHint();

  const headerClass =
    headerVariant === 'violet'
      ? 'bg-gradient-to-r from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8]'
      : headerVariant === 'green'
        ? 'bg-gradient-to-r from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8]'
        : 'bg-gradient-to-r from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8]';

  return (
    <div
      {...spreadsheetGuardProps}
      className={cn(
        'flex min-h-0 w-full max-w-none self-stretch flex-col overflow-hidden',
        'rounded-2xl border border-slate-200/90 bg-white shadow-sm',
        'transition-all duration-200 hover:shadow-md',
        !canExport && 'select-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-4 py-2.5 text-white',
          headerClass,
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[9px] font-bold tracking-tight ring-1 ring-white/25">
            XL
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90">
          {loading
            ? 'Loading…'
            : rowCount != null
              ? `${rowCount} ${rowCount === 1 ? countUnit : `${countUnit}s`}`
              : ''}
        </span>
      </div>

      {(toolbar || hint) && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600">
          {toolbar}
          {hint && (
            <>
              {toolbar && <span className="hidden text-slate-300 sm:inline">|</span>}
              <span className="hidden items-center gap-0.5 rounded-md bg-slate-200/70 px-1.5 py-0.5 font-medium text-slate-600 sm:inline-flex">
                ↑ ↓ ← →
              </span>
              <span className="text-slate-500">{hint}</span>
              {showRestrictionHint && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-amber-700">Copy/download restricted</span>
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
