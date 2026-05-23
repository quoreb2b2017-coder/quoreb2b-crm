'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedAutoSave } from '@/hooks/useDebouncedAutoSave';
import { useLeadActivityTracker } from '@/hooks/useLeadActivityTracker';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Users } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { batchesService } from '@/lib/api/batches.service';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';

export interface BatchExcelViewProps {
  batchId?: string;
  name: string;
  rowCount?: number;
  columnCount?: number;
  sourceFileName?: string;
  createdByName?: string;
  createdByEmail?: string;
  data: SpreadsheetData | null;
  /** Edit & save this batch (owner only) */
  editable?: boolean;
  /** Create a new batch from filtered rows (db admin: admin-shared batch only) */
  allowCreateSubBatch?: boolean;
  /** Admin batch id when creating sub-batch */
  sourceBatchId?: string;
  onDataChange?: (data: SpreadsheetData) => void;
  onClose?: () => void;
  closeLabel?: string;
  afterSubBatchCreated?: () => void;
  /** Separate team page (admin / db admin) */
  teamHref?: string;
}

export function BatchExcelView({
  batchId,
  name,
  rowCount,
  columnCount,
  sourceFileName,
  createdByName,
  createdByEmail,
  data,
  editable = false,
  allowCreateSubBatch = false,
  sourceBatchId,
  onDataChange,
  onClose,
  closeLabel = 'Close',
  afterSubBatchCreated,
  teamHref,
}: BatchExcelViewProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [batchModal, setBatchModal] = useState<{ rows: string[][]; headers: string[] } | null>(
    null,
  );
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const sharedBy = createdByName ?? createdByEmail;
  const { trackBatchOpen, trackLeadTouch } = useLeadActivityTracker(batchId, name);

  useEffect(() => {
    if (editable && batchId) trackBatchOpen();
  }, [editable, batchId, trackBatchOpen]);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const { status: autoSaveStatus, markDirty: markAutoSave } = useDebouncedAutoSave(
    Boolean(batchId && editable),
    data,
    async () => {
      const payload = dataRef.current;
      if (!batchId || !payload) return;
      const updated = await batchesService.update(batchId, {
        headers: payload.headers,
        rows: payload.rows,
      });
      setDirty(false);
      onDataChange?.({
        fileName: updated.sourceFileName ?? payload.fileName,
        sheetName: updated.name,
        headers: updated.headers,
        rows: updated.rows,
      });
    },
    1200,
  );

  const handleDataChange = useCallback(
    (next: { headers: string[]; rows: string[][] }) => {
      setDirty(true);
      markAutoSave();
      onDataChange?.({
        fileName: data?.fileName ?? name,
        sheetName: data?.sheetName ?? name,
        headers: next.headers,
        rows: next.rows,
      });
    },
    [data, name, onDataChange, markAutoSave],
  );

  const saveBatch = async () => {
    if (!batchId || !data) return;
    setSaving(true);
    try {
      const updated = await batchesService.update(batchId, {
        headers: data.headers,
        rows: data.rows,
      });
      setDirty(false);
      onDataChange?.({
        fileName: updated.sourceFileName ?? data.fileName,
        sheetName: updated.name,
        headers: updated.headers,
        rows: updated.rows,
      });
      toast.success('Batch saved', `${updated.rowCount} rows updated`);
    } catch (e) {
      toast.error('Save failed', extractApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = useCallback((rows: string[][], headers: string[]) => {
    const now = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    setBatchName(`Batch ${now}`);
    setBatchDesc('');
    setBatchModal({ rows, headers });
  }, []);

  const handleCreateSubBatch = async () => {
    if (!batchModal || !batchName.trim() || !sourceBatchId) return;
    setSavingBatch(true);
    try {
      const batch = await batchesService.create({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        headers: batchModal.headers,
        rows: batchModal.rows,
        sourceFileName: data?.fileName ?? sourceFileName,
        sourceBatchId,
      });
      toast.success('Batch created', `"${batch.name}" — share it with your team from Batches`);
      setBatchModal(null);
      window.dispatchEvent(
        new CustomEvent('batch-created', {
          detail: {
            id: batch.id,
            batchMonth: batch.batchMonth,
            batchYear: batch.batchYear,
          },
        }),
      );
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      afterSubBatchCreated?.();
      router.push(`/db-admin/batches/${batch.id}`);
    } catch (e) {
      toast.error('Could not create batch', extractApiError(e));
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#e6e6e6]">
      <div className="flex flex-shrink-0 items-center justify-between bg-[#217346] px-4 py-2 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-white/20">
            <span className="text-[10px] font-bold">XL</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{name}</p>
            <p className="truncate text-[11px] text-white/70">
              {rowCount != null && `${rowCount} rows`}
              {columnCount != null && ` · ${columnCount} columns`}
              {sourceFileName && ` · ${sourceFileName}`}
              {editable && batchId && autoSaveStatus === 'pending' && ' · Editing…'}
              {editable && batchId && autoSaveStatus === 'saving' && ' · Auto-saving…'}
              {editable && batchId && autoSaveStatus === 'saved' && ' · Saved'}
              {editable && batchId && autoSaveStatus === 'error' && ' · Save failed'}
              {dirty && editable && !batchId && ' · Unsaved changes'}
              {allowCreateSubBatch && ' · Filter rows → Create Batch'}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {sharedBy && allowCreateSubBatch && (
            <span className="hidden text-xs text-white/70 sm:block">
              From admin: <span className="font-medium text-white">{sharedBy}</span>
            </span>
          )}
          {teamHref && (
            <button
              type="button"
              onClick={() => router.push(teamHref)}
              className="inline-flex items-center gap-1.5 rounded bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
            >
              <Users className="h-3.5 w-3.5" />
              Team
            </button>
          )}
          {editable && batchId && (
            <button
              type="button"
              onClick={saveBatch}
              disabled={saving || (!dirty && autoSaveStatus !== 'error')}
              className="inline-flex items-center gap-1.5 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save now
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 transition-colors hover:bg-white/20"
              title={closeLabel}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {data && (
          <ExcelPreviewGrid
            data={data}
            dataResetKey={batchId ? `batch-${batchId}` : undefined}
            fillHeight
            editable={editable}
            onDataChange={editable ? handleDataChange : undefined}
            onCreateBatch={allowCreateSubBatch ? openCreateModal : undefined}
            onLeadCellFocus={
              editable && batchId
                ? (sourceRow, col) => {
                    const row = data.rows[sourceRow];
                    if (row) trackLeadTouch(data.headers, row, sourceRow, col);
                  }
                : undefined
            }
          />
        )}
      </div>

      {batchModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setBatchModal(null)}
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="font-semibold text-slate-900">Create batch from admin data</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {batchModal.rows.length} rows · {batchModal.headers.length} columns
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Batch name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={batchDesc}
                    onChange={(e) => setBatchDesc(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  onClick={() => setBatchModal(null)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubBatch}
                  disabled={savingBatch || !batchName.trim()}
                  className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {savingBatch ? 'Creating…' : 'Create batch'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
