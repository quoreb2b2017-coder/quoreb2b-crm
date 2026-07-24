'use client';

import type { MasterUploadActivityMeta } from '@/lib/constants/activity-labels';
import { cn } from '@/lib/utils/cn';

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'blue' | 'amber' | 'rose' | 'slate';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        tone === 'blue' && 'bg-[#e8f1fb] text-[#1e5a9e]',
        tone === 'amber' && 'bg-amber-50 text-amber-900',
        tone === 'rose' && 'bg-rose-50 text-rose-900',
        tone === 'slate' && 'bg-slate-100 text-slate-700',
      )}
    >
      <span className="font-medium opacity-80">{label}</span>
      <span>{value.toLocaleString('en-US')}</span>
    </span>
  );
}

export function MasterUploadActivityDetail({
  meta,
  compact = false,
}: {
  meta: MasterUploadActivityMeta;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="min-w-[280px]">
        <p className="truncate text-xs font-bold text-slate-900" title={meta.fileName}>
          {meta.fileName}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <StatPill label="Added" value={meta.addedRows} tone="blue" />
          <StatPill label="Dup" value={meta.duplicateCount} tone="amber" />
          <StatPill label="Missing" value={meta.missingCount} tone="rose" />
        </div>
      </div>
    );
  }

  return (
    <div className="al-upload-detail-card min-w-[300px] rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Master file</p>
          <p className="truncate text-sm font-bold text-slate-900" title={meta.fileName}>
            {meta.fileName}
          </p>
        </div>
        {meta.fileRowCount > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {meta.fileRowCount.toLocaleString('en-US')} rows
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#e8f1fb] px-2 py-1.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#2e7ad1]">Added</p>
          <p className="text-sm font-bold tabular-nums text-[#1e5a9e]">
            {meta.addedRows.toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Duplicates</p>
          <p className="text-sm font-bold tabular-nums text-amber-900">
            {meta.duplicateCount.toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-lg bg-rose-50 px-2 py-1.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Missing</p>
          <p className="text-sm font-bold tabular-nums text-rose-900">
            {meta.missingCount.toLocaleString('en-US')}
          </p>
        </div>
      </div>
    </div>
  );
}
