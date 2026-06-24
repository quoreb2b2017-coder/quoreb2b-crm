'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const DEFAULT_PREVIEW = 8;

function cellDisplay(value: string | undefined): string {
  const text = String(value ?? '').trim();
  return text || '—';
}

function pickPreviewColumns(
  headers: string[],
  rows: string[][],
): Array<{ index: number; header: string }> {
  const scored = headers
    .map((header, index) => ({
      header,
      index,
      filled: rows.filter((row) => String(row[index] ?? '').trim()).length,
    }))
    .filter((col) => col.filled > 0)
    .sort((a, b) => b.filled - a.filled);

  const picked = scored.slice(0, 6);
  if (picked.length >= 2) {
    return picked.map(({ header, index }) => ({ header, index }));
  }

  return headers.slice(0, Math.min(6, headers.length)).map((header, index) => ({
    header,
    index,
  }));
}

export function CampaignExtractPreview({
  headers,
  rows,
  className,
}: {
  headers: string[];
  rows: string[][];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const columns = useMemo(() => pickPreviewColumns(headers, rows), [headers, rows]);
  const hiddenColumnCount = Math.max(0, headers.length - columns.length);
  const displayRows = expanded ? rows : rows.slice(0, DEFAULT_PREVIEW);
  const canExpand = rows.length > DEFAULT_PREVIEW;

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500',
          className,
        )}
      >
        No contacts in this extract.
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 to-white px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Rows3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Extract preview</p>
            <p className="text-[11px] text-slate-500">
              {displayRows.length} of {rows.length.toLocaleString()} contact
              {rows.length === 1 ? '' : 's'}
              {hiddenColumnCount > 0
                ? ` · ${columns.length} key columns (${hiddenColumnCount} hidden)`
                : ` · ${columns.length} column${columns.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      </div>

      {columns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/50 px-3 py-2 sm:px-4">
          {columns.map((col) => (
            <span
              key={col.index}
              className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
            >
              {col.header}
            </span>
          ))}
        </div>
      )}

      <div className="divide-y divide-slate-100 md:hidden">
        {displayRows.map((row, rowIndex) => (
          <article key={rowIndex} className="p-3.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-600">
              Contact {rowIndex + 1}
            </p>
            <dl className="space-y-1.5">
              {columns.map((col) => (
                <div key={col.index} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-xs">
                  <dt className="truncate font-medium text-slate-500">{col.header}</dt>
                  <dd className="min-w-0 break-words text-slate-800">{cellDisplay(row[col.index])}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden max-h-[min(320px,42vh)] overflow-auto md:block">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
            <tr className="border-b border-slate-200">
              <th className="w-11 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.index}
                  className="px-3 py-2.5 text-[11px] font-semibold text-slate-700"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-slate-100 transition-colors hover:bg-violet-50/30',
                  rowIndex % 2 === 1 && 'bg-slate-50/50',
                )}
              >
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{rowIndex + 1}</td>
                {columns.map((col) => {
                  const value = cellDisplay(row[col.index]);
                  return (
                    <td
                      key={col.index}
                      className="max-w-[220px] truncate px-3 py-2.5 text-slate-800"
                      title={value}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/40 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show fewer contacts
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show all {rows.length.toLocaleString()} contacts
            </>
          )}
        </button>
      )}
    </div>
  );
}
