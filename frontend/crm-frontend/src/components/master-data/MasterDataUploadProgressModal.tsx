'use client';

import { Loader2 } from 'lucide-react';
import type { MasterDataImportProgress } from '@/lib/api/master-data.service';

interface MasterDataUploadProgressModalProps {
  open: boolean;
  progress: MasterDataImportProgress | null;
  fileName?: string;
}

export function MasterDataUploadProgressModal({
  open,
  progress,
  fileName,
}: MasterDataUploadProgressModalProps) {
  if (!open || !progress) return null;

  const percent = Math.max(0, Math.min(100, progress.percent));
  const isDone = progress.phase === 'done';
  const rowLabel =
    progress.totalRows && progress.totalRows > 0
      ? `${(progress.rowsProcessed ?? 0).toLocaleString()} / ${progress.totalRows.toLocaleString()} rows`
      : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f1fb]">
            <Loader2 className="h-5 w-5 animate-spin text-[#2e7ad1]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
              {isDone ? 'Upload complete' : 'Uploading master data'}
            </h3>
            {fileName && (
              <p className="mt-0.5 truncate text-xs text-slate-500" title={fileName}>
                {fileName}
              </p>
            )}
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">{progress.message}</span>
          <span className="tabular-nums font-semibold text-[#2e7ad1]">{percent}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {rowLabel && (
          <p className="mt-3 text-center text-xs text-slate-500">{rowLabel}</p>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          {isDone
            ? 'Your data is saved in the master database.'
            : 'Import continues on the server — you can switch tabs or use other CRM pages.'}
        </p>
      </div>
    </div>
  );
}
