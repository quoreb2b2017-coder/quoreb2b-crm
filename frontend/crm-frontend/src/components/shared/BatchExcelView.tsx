'use client';

import '@/components/batches/batches.css';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedAutoSave } from '@/hooks/useDebouncedAutoSave';
import { useLeadActivityTracker } from '@/hooks/useLeadActivityTracker';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Users, ShieldAlert } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import type { MasterBatchCreatePayload } from '@/components/master-database/MasterDatabaseExplorer';
import { batchesService } from '@/lib/api/batches.service';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { CheckSuppressionModal } from '@/components/employee/CheckSuppressionModal';
import { handleSuppressionCheckComplete } from '@/lib/master-data/handle-suppression-result';
import { EMPLOYEE_DISPOSITION_OPTIONS, isCallbackDisposition } from '@/lib/disposition/disposition-values';
import { CallbackReminderSetupModal } from '@/components/disposition/CallbackReminderSetupModal';
import { dispositionService } from '@/lib/api/disposition.service';

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
  /** Employee: check rows against admin suppression campaigns */
  enableCheckSuppression?: boolean;
  checkSuppressionBatchId?: string;
  /** Employee: Status/Disposition dropdown instead of free text */
  enableDispositionDropdown?: boolean;
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
  enableCheckSuppression = false,
  checkSuppressionBatchId,
  enableDispositionDropdown = false,
}: BatchExcelViewProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  } | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [duplicateHighlightRows, setDuplicateHighlightRows] = useState<number[]>([]);
  const [markedLeadRows, setMarkedLeadRows] = useState<number[]>([]);
  const [callbackSetup, setCallbackSetup] = useState<{
    sourceRow: number;
    leadLabel: string;
    apply: (value: string) => void;
  } | null>(null);
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
      toast.success('Campaign saved', `${updated.rowCount} contacts updated`);
    } catch (e) {
      toast.error('Save failed', extractApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = useCallback(
    (payload: MasterBatchCreatePayload) => {
    const now = new Date().toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    setBatchName(`Campaign ${now}`);
    setBatchDesc('');
    setBatchModal({
      rows: payload.rows ?? [],
      headers: payload.headers,
      sourceRowIndices: payload.sourceRowIndices ?? [],
    });
  },
  [],
  );

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
        parentSourceRowIndices: batchModal.sourceRowIndices,
      });
      toast.success('Campaign created', `"${batch.name}" — share it with your team from All campaigns`);
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
      toast.error('Could not create campaign', extractApiError(e));
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="xl-view">
      <div className="xl-view-titlebar">
        <div className="relative z-[1] flex min-w-0 items-center gap-3">
          <div className="xl-badge">XL</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{name}</p>
            <p className="truncate text-[11px] text-white/75">
              {rowCount != null && `${rowCount} contacts`}
              {columnCount != null && ` · ${columnCount} columns`}
              {sourceFileName && ` · ${sourceFileName}`}
              {editable && batchId && autoSaveStatus === 'pending' && ' · Editing…'}
              {editable && batchId && autoSaveStatus === 'saving' && ' · Auto-saving…'}
              {editable && batchId && autoSaveStatus === 'saved' && ' · Saved'}
              {editable && batchId && autoSaveStatus === 'error' && ' · Save failed'}
              {dirty && editable && !batchId && ' · Unsaved changes'}
              {allowCreateSubBatch && ' · Filter contacts → Create Campaign'}
            </p>
          </div>
        </div>
        <div className="relative z-[1] flex flex-shrink-0 items-center gap-2">
          {sharedBy && allowCreateSubBatch && (
            <span className="hidden text-xs text-white/75 sm:block">
              From admin: <span className="font-medium text-white">{sharedBy}</span>
            </span>
          )}
          {teamHref && (
            <button type="button" onClick={() => router.push(teamHref)} className="xl-view-btn">
              <Users className="h-3.5 w-3.5" />
              Team
            </button>
          )}
          {enableCheckSuppression && checkSuppressionBatchId && (
            <button
              type="button"
              onClick={() => setCheckOpen(true)}
              className="xl-view-btn"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Check suppression
            </button>
          )}
          {editable && batchId && (
            <button
              type="button"
              onClick={saveBatch}
              disabled={saving || (!dirty && autoSaveStatus !== 'error')}
              className="xl-view-btn"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save now
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="xl-view-btn px-2"
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
                    setMarkedLeadRows((prev) =>
                      prev.includes(sourceRow) ? prev : [...prev, sourceRow],
                    );
                    const row = data.rows[sourceRow];
                    if (row) trackLeadTouch(data.headers, row, sourceRow, col);
                  }
                : undefined
            }
            duplicateRowIndices={duplicateHighlightRows}
            markedRowIndices={markedLeadRows}
            dispositionSelectOptions={
              enableDispositionDropdown ? EMPLOYEE_DISPOSITION_OPTIONS : undefined
            }
            onDispositionSelect={
              enableDispositionDropdown && batchId
                ? ({ sourceRow, nextValue, apply }) => {
                    if (isCallbackDisposition(nextValue)) {
                      const row = data.rows[sourceRow] ?? [];
                      const leadLabel =
                        row.slice(0, 4).filter((c) => c && c !== '-').join(' · ') ||
                        `Row ${sourceRow + 1}`;
                      setCallbackSetup({ sourceRow, leadLabel, apply });
                      return;
                    }
                    apply(nextValue);
                  }
                : undefined
            }
          />
        )}
      </div>

      {callbackSetup && batchId ? (
        <CallbackReminderSetupModal
          leadLabel={callbackSetup.leadLabel}
          onCancel={() => setCallbackSetup(null)}
          onConfirm={async ({ hours, description }) => {
            await dispositionService.createCallbackReminder({
              batchId,
              rowIndex: callbackSetup.sourceRow,
              hours,
              description,
              leadLabel: callbackSetup.leadLabel,
            });
            callbackSetup.apply('Callback');
            setCallbackSetup(null);
            toast.success(`Callback reminder set for ${hours}h`);
          }}
        />
      ) : null}

      {batchModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setBatchModal(null)}
            aria-hidden
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="pointer-events-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">Create campaign from admin data</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
                      {batchModal.rows.length.toLocaleString('en-US')} contacts
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {batchModal.headers.length} columns
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchModal(null)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Campaign name <span className="text-red-500">*</span>
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
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={batchDesc}
                    onChange={(e) => setBatchDesc(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Columns ({batchModal.headers.length})
                  </p>
                  <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 sm:max-h-32">
                    <div className="flex flex-wrap gap-1.5">
                      {batchModal.headers.map((header) => (
                        <span
                          key={header}
                          className="inline-block max-w-full truncate rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                          title={header}
                        >
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-100 px-4 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setBatchModal(null)}
                    className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSubBatch}
                    disabled={savingBatch || !batchName.trim()}
                    className="w-full rounded-xl bg-[#2e7ad1] py-2.5 text-sm font-medium text-white hover:bg-[#2568b8] disabled:opacity-50 sm:flex-1"
                  >
                    {savingBatch ? 'Creating…' : 'Create campaign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {enableCheckSuppression && checkSuppressionBatchId && (
        <>
          <CheckSuppressionModal
            open={checkOpen}
            onClose={() => setCheckOpen(false)}
            defaultSourceKind="batch"
            defaultSourceId={checkSuppressionBatchId}
            baseFileName={sourceFileName ?? name}
            onComplete={(result) => {
              if (result.duplicateSourceIndices?.length) {
                setDuplicateHighlightRows(result.duplicateSourceIndices);
              }
              handleSuppressionCheckComplete(router, 'employee', result, {
                highlightOnly: !result.duplicateFileId,
                sourceRole: result.duplicateSourceRole,
              });
            }}
          />
        </>
      )}
    </div>
  );
}
