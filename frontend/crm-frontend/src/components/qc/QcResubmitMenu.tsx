'use client';

import Link from 'next/link';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { QcFixedPopover } from '@/components/qc/QcFixedPopover';

export function QcResubmitMenu({
  open,
  x,
  y,
  leadLabel,
  batchId,
  qcStatus,
  loading,
  onResubmit,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  leadLabel?: string;
  batchId: string;
  qcStatus?: string;
  loading?: boolean;
  onResubmit: () => void;
  onClose: () => void;
}) {
  return (
    <QcFixedPopover
      open={open}
      x={x}
      y={y}
      onClose={onClose}
      className="w-[min(280px,92vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
    >
      <div className="border-b border-slate-100 bg-amber-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
          {qcStatus ?? 'Needs fix'} — resubmit
        </p>
        {leadLabel && (
          <p className="truncate text-xs font-medium text-slate-700" title={leadLabel}>
            {leadLabel}
          </p>
        )}
      </div>
      <div className="space-y-1 p-2">
        <p className="px-2 py-1 text-[11px] leading-relaxed text-slate-600">
          1. Open your campaign and fix the lead row.
          <br />
          2. Resubmit to send it back to admin All QC.
        </p>
        <Link
          href={`/employee/batches/${batchId}`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50"
          onClick={onClose}
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Open campaign to fix
        </Link>
        <button
          type="button"
          disabled={loading}
          onClick={onResubmit}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg bg-[#217346] px-3 py-2.5 text-sm font-bold text-white hover:bg-[#1a5c38] disabled:opacity-50',
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Resubmit to admin QC
        </button>
      </div>
    </QcFixedPopover>
  );
}
