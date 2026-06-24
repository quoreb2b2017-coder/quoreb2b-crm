'use client';

import { useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { spreadsheetGuardProps } from '@/lib/spreadsheet/spreadsheet-access';
import { useCanExportSpreadsheet, useShowSpreadsheetRestrictionHint } from '@/hooks/useSpreadsheetCopyGuard';

const DEFAULT_PREVIEW_LIMIT = 500;

export interface SpreadsheetPreviewAction {
  label: string;
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export interface SpreadsheetPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  totalRows?: number;
  previewLimit?: number;
  banner?: React.ReactNode;
  note?: string;
  actions?: SpreadsheetPreviewAction[];
  /** Pin modal near top of viewport (better on long scroll pages). */
  alignTop?: boolean;
}

export function SpreadsheetPreviewModal({
  isOpen,
  onClose,
  title,
  subtitle,
  headers,
  rows,
  totalRows,
  previewLimit = DEFAULT_PREVIEW_LIMIT,
  banner,
  note,
  actions,
  alignTop = false,
}: SpreadsheetPreviewModalProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const canExport = useCanExportSpreadsheet();
  const showRestrictionHint = useShowSpreadsheetRestrictionHint();

  if (!isOpen) return null;

  const total = totalRows ?? rows.length;
  const visible = rows.slice(0, previewLimit);
  const truncated = total > visible.length;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'fixed inset-0 z-[60] overflow-y-auto p-4',
          alignTop ? 'pt-6 pb-8' : 'flex items-center justify-center',
        )}
      >
        <div
          className={cn(
            'mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
            alignTop ? 'max-h-[min(88vh,calc(100vh-3rem))]' : 'max-h-[88vh]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="font-semibold text-slate-900">{title}</p>
              {subtitle ? (
                <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-500">
                  {total} contact{total === 1 ? '' : 's'}
                  {truncated ? ` · showing first ${visible.length}` : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {banner}

          {note ? (
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs text-slate-600">
              {note}
            </div>
          ) : null}

          {showRestrictionHint && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-2 text-xs text-amber-900">
              Copy/download restricted — paste shows ++++++
            </div>
          )}

          <div
            ref={tableRef}
            {...spreadsheetGuardProps}
            className={cn('min-h-0 flex-1 overflow-auto bg-white', !canExport && 'select-none')}
          >
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-[#f2f2f2]">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="border border-[#c6c6c6] px-2 py-1.5 text-left text-xs font-semibold text-slate-800"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(headers.length, 1)}
                      className="border border-[#e0e0e0] py-10 text-center text-slate-500"
                    >
                      No contacts to preview
                    </td>
                  </tr>
                ) : (
                  visible.map((row, rowIndex) => (
                    <tr key={rowIndex} className="even:bg-[#fafafa]">
                      {headers.map((_, colIndex) => (
                        <td
                          key={`${rowIndex}-${colIndex}`}
                          className="border border-[#e0e0e0] px-2 py-1 text-slate-800"
                        >
                          {row[colIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {(actions?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              {actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={action.disabled || action.loading}
                  onClick={() => void action.onClick()}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50',
                    action.variant === 'primary'
                      ? 'bg-[#6d28d9] text-white hover:bg-[#5b21b6]'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {action.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
