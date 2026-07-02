'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useMasterDataImportStore } from '@/store/master-data-import.store';

export function MasterDataImportBanner() {
  const [hidden, setHidden] = useState(false);
  const uiPhase = useMasterDataImportStore((s) => s.uiPhase);
  const jobId = useMasterDataImportStore((s) => s.jobId);
  const progress = useMasterDataImportStore((s) => s.progress);
  const fileName = useMasterDataImportStore((s) => s.fileName);

  useEffect(() => {
    if (uiPhase === 'active') setHidden(false);
  }, [uiPhase, jobId]);

  if (hidden || uiPhase !== 'active' || !progress) return null;

  const percent = Math.max(0, Math.min(100, progress.percent));
  const rowLabel =
    progress.totalRows && progress.totalRows > 0
      ? `${(progress.rowsProcessed ?? 0).toLocaleString()} / ${progress.totalRows.toLocaleString()} rows`
      : null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9998] mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-[#2e7ad1]/30 bg-white p-4 shadow-lg md:left-auto md:right-6">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f1fb]">
        <Loader2 className="h-4 w-4 animate-spin text-[#2e7ad1]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">Master data import running</p>
        {fileName && (
          <p className="truncate text-xs text-slate-500" title={fileName}>
            {fileName}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-600">{progress.message}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {rowLabel ? `${rowLabel} · ` : ''}
          {percent}% — you can use other pages; import continues on the server
        </p>
      </div>
      <button
        type="button"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Hide banner"
        onClick={() => setHidden(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
