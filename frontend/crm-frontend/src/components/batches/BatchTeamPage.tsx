'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, GitBranch, Table2 } from 'lucide-react';
import { BatchHierarchyPanel } from '@/components/batches/BatchHierarchyPanel';

export function BatchTeamPage({
  batchId,
  backHref,
  batchViewHref,
  backLabel = 'Back to campaigns',
}: {
  batchId: string;
  backHref: string;
  batchViewHref: string;
  backLabel?: string;
}) {
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </button>
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 shrink-0 text-indigo-600" />
                <h1 className="truncate text-base font-semibold text-slate-900">Team & activity</h1>
              </div>
              <p className="text-xs text-slate-500">
                Who has this data, how much was shared, and what actions were taken
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push(batchViewHref)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#217346] bg-[#217346] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#1a5c38]"
          >
            <Table2 className="h-3.5 w-3.5" />
            Open spreadsheet
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <BatchHierarchyPanel batchId={batchId} standalone className="h-full min-h-0" />
      </div>
    </div>
  );
}
