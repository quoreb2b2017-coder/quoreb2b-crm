'use client';

import { X } from 'lucide-react';

interface MasterDataDuplicatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  duplicateCount: number;
  headers: string[];
  rows: string[][];
  note?: string;
}

export function MasterDataDuplicatePreviewModal({
  isOpen,
  onClose,
  title = 'Duplicate rows',
  duplicateCount,
  headers,
  rows,
  note,
}: MasterDataDuplicatePreviewModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-0.5 text-sm text-slate-500">
                {duplicateCount} duplicate row{duplicateCount === 1 ? '' : 's'} detected
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close duplicate preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
            <p className="font-medium">
              These rows already exist in master data or repeat inside the same file.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {note ??
                'Database Admin can review these rows here, but cannot download them.'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
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
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(headers.length, 1)}
                      className="border border-[#e0e0e0] py-8 text-center text-slate-500"
                    >
                      No duplicate preview rows available
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="even:bg-[#fafafa]">
                      {headers.map((header, colIdx) => (
                        <td
                          key={`${header}-${colIdx}`}
                          className="border border-[#e0e0e0] px-2 py-1 text-slate-700"
                        >
                          {row[colIdx] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
