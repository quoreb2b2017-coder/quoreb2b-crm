'use client';

import { Loader2 } from 'lucide-react';
import { useMasterDataImportStore } from '@/store/master-data-import.store';

/** Compact import status — visible in the top bar on every CRM page. */
export function MasterDataImportHeaderChip() {
  const uiPhase = useMasterDataImportStore((s) => s.uiPhase);
  const progress = useMasterDataImportStore((s) => s.progress);
  const fileName = useMasterDataImportStore((s) => s.fileName);

  if (uiPhase !== 'active' || !progress) return null;

  const percent = Math.max(0, Math.min(100, progress.percent));
  const rowLabel =
    progress.totalRows && progress.totalRows > 0
      ? `${(progress.rowsProcessed ?? 0).toLocaleString()}/${progress.totalRows.toLocaleString()}`
      : null;

  return (
    <div
      className="flex max-w-[220px] items-center gap-2 rounded-lg border border-[#2e7ad1]/25 bg-[#e8f1fb] px-2.5 py-1.5 text-xs font-medium text-[#1d5fa8] sm:max-w-xs"
      title={fileName ? `${fileName} — ${progress.message}` : progress.message}
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      <span className="truncate tabular-nums">
        Import {percent}%
        {rowLabel ? ` · ${rowLabel}` : ''}
      </span>
    </div>
  );
}
