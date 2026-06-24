'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import type { BatchRecord } from '@/lib/api/batches.service';
import { FileSpreadsheet } from 'lucide-react';

function formatDate(val?: string) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface SuppressionCampaignListProps {
  batches: BatchRecord[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  emptyHint?: string;
  onOpenBatch?: (batch: BatchRecord) => void;
  renderActions: (batch: BatchRecord) => React.ReactNode;
  headerExtra?: React.ReactNode;
}

export function SuppressionCampaignList({
  batches,
  loading = false,
  title = 'Suppression',
  subtitle = 'One campaign per channel · all delivered data merges here',
  emptyHint = 'Open a channel campaign and upload delivered Excel/CSV',
  onOpenBatch,
  renderActions,
  headerExtra,
}: SuppressionCampaignListProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        Loading campaigns…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          {headerExtra}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {batches.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate-500">
            <FileSpreadsheet className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No channel campaigns yet</p>
            <p className="max-w-sm text-xs">{emptyHint}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Campaign</th>
                <th className="px-4 py-2.5 text-right">Contacts</th>
                <th className="px-4 py-2.5">Last updated</th>
                <th className="px-4 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                  onClick={() => onOpenBatch?.(batch)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{batch.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {batch.rowCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(batch.updatedAt ?? batch.createdAt)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {renderActions(batch)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
