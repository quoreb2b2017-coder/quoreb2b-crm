'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { spreadsheetGuardProps } from '@/lib/spreadsheet/spreadsheet-access';
import { useCanExportSpreadsheet, useShowSpreadsheetRestrictionHint } from '@/hooks/useSpreadsheetCopyGuard';

interface ExcelSheetShellProps {
  title: string;
  rowCount?: number;
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
      ? 'bg-gradient-to-r from-violet-700 to-purple-800'
      : 'bg-[#217346]';

  return (
    <div
      {...spreadsheetGuardProps}
      className={cn(
        'flex min-h-0 w-full max-w-none self-stretch flex-col overflow-hidden',
        'border-x-0 border-y border-[#b4b4b4] bg-[#e6e6e6]',
        'shadow-sm transition-shadow duration-200 hover:shadow-md',
        'sm:border sm:rounded-sm',
        !canExport && 'select-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-3 py-1.5 text-white',
          headerClass,
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[9px] font-bold tracking-tight">
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
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-200/80 px-1.5 py-0.5 font-medium text-slate-600">
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
