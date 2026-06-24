'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, Trash2, Cloud, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import {
  getSampleMasterData,
  parseSpreadsheetFile,
  type SpreadsheetData,
} from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  deliveredDataService,
  recordToSpreadsheet,
  type DeliveredBatchCoverage,
} from '@/lib/api/delivered-data.service';
import { extractApiError } from '@/lib/api/errors';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { useDebouncedAutoSave, type AutoSaveStatus } from '@/hooks/useDebouncedAutoSave';
import { SuppressionDataClearConfirmModal } from '@/components/suppression-data/SuppressionDataClearConfirmModal';

const ACCEPT = '.csv,.xlsx,.xls';

type CampaignChannel = 'voip' | 'gps' | 'email' | 'other';

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  voip: 'VOIP',
  gps: 'GPS',
  email: 'Email',
  other: 'Other',
};

function detectChannelFromName(name: string): CampaignChannel {
  const lower = name.toLowerCase();
  if (lower.includes('voip')) return 'voip';
  if (lower.includes('gps')) return 'gps';
  if (lower.includes('email')) return 'email';
  return 'other';
}

function mergeHeaders(existing: string[], incoming: string[]) {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const header of incoming) {
    if (!seen.has(header)) {
      merged.push(header);
      seen.add(header);
    }
  }
  return merged;
}

function alignRowToHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
) {
  return targetHeaders.map((header) => {
    const idx = sourceHeaders.indexOf(header);
    return idx >= 0 ? String(row[idx] ?? '').trim() : '';
  });
}

function rowKey(row: string[]) {
  return row.join('\u001f');
}

function collectDuplicateRows(
  existing: SpreadsheetData | null,
  incoming: SpreadsheetData,
) {
  const headers = mergeHeaders(existing?.headers ?? [], incoming.headers);
  const seen = new Set(
    (existing?.rows ?? []).map((row) =>
      rowKey(alignRowToHeaders(row, existing?.headers ?? [], headers)),
    ),
  );
  const duplicateRows: string[][] = [];

  for (const row of incoming.rows) {
    const aligned = alignRowToHeaders(row, incoming.headers, headers);
    if (!aligned.some((cell) => cell.length > 0)) continue;
    const key = rowKey(aligned);
    if (seen.has(key)) {
      duplicateRows.push(aligned);
    } else {
      seen.add(key);
    }
  }

  return { headers, duplicateRows };
}

function AutoSaveHint({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return null;
  const label =
    status === 'pending'
      ? 'Unsaved — auto-saving soon…'
      : status === 'saving'
        ? 'Auto-saving…'
        : status === 'saved'
          ? 'All changes saved'
          : 'Auto-save failed — use Save edits';
  const className =
    status === 'error'
      ? 'text-red-600'
      : status === 'saved'
        ? 'text-[#217346]'
        : 'text-slate-500';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'saved' && <Cloud className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function SuppressionDataUploadPanel() {
  const canExport = useCanExportSpreadsheet();
  const router = useRouter();
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [filteredRows, setFilteredRows] = useState<string[][]>([]);
  const [parsing, setParsing] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true);
  const [savingDb, setSavingDb] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [replaceOnUpload, setReplaceOnUpload] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  // ── Batch create modal state ──
  const [coverage, setCoverage] = useState<DeliveredBatchCoverage | null>(null);
  const [hideBatchedRows, setHideBatchedRows] = useState(false);
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  } | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const [campaignChannel, setCampaignChannel] = useState<CampaignChannel>('other');
  const [savingBatch, setSavingBatch] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    fileName: string;
    headers: string[];
    duplicateRows: string[][];
    addedRows: number;
    duplicateCount: number;
    totalRows: number;
    duplicatesBatchName?: string;
  } | null>(null);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const applyRecord = useCallback((record: Awaited<ReturnType<typeof deliveredDataService.save>>) => {
    const sheet = recordToSpreadsheet(record);
    setData(sheet);
    setFilteredRows(sheet.rows);
    setTotalRows(record.rowCount);
    setSavedAt(record.updatedAt ?? record.createdAt ?? new Date().toISOString());
    setDirty(false);
    return sheet;
  }, []);

  const dataRef = useRef<SpreadsheetData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const { status: autoSaveStatus, markDirty: autoSaveMarkDirty } = useDebouncedAutoSave(
    Boolean(data),
    data,
    async () => {
      const payload = dataRef.current;
      if (!payload) return;
      const record = await deliveredDataService.save(payload, 'replace');
      applyRecord(record);
    },
    1200,
  );

  const handleGridChange = useCallback(
    (next: { headers: string[]; rows: string[][] }) => {
      setData((prev) =>
        prev ? { ...prev, headers: next.headers, rows: next.rows } : null,
      );
      setTotalRows(next.rows.length);
      setDirty(true);
      autoSaveMarkDirty();
    },
    [autoSaveMarkDirty],
  );

  const logUploadActivity = useCallback(
    async (mode: 'append' | 'replace', record: Awaited<ReturnType<typeof deliveredDataService.save>>, fileName: string) => {
      try {
        await activityLogsService.track({
          action: 'DELIVERED_DATA_UPLOAD',
          resource: 'suppression-data',
          path: '/admin/suppression-file',
          metadata: { mode, fileName, addedRows: record.addedRows, totalRows: record.rowCount, email: user?.email },
        });
      } catch { /* non-blocking */ }
    },
    [user],
  );

  const persistToDb = useCallback(
    async (payload: SpreadsheetData, mode: 'append' | 'replace' = 'append') => {
      setSavingDb(true);
      try {
        const duplicatePreview =
          mode === 'append' ? collectDuplicateRows(dataRef.current, payload) : null;
        const record = await deliveredDataService.save(payload, mode);
        applyRecord(record);
        await logUploadActivity(mode, record, payload.fileName);
        if (mode === 'append' && record.addedRows != null) {
          const skipped = record.skippedDuplicates && record.skippedDuplicates > 0
            ? ` · ${record.skippedDuplicates} duplicate(s) skipped` : '';
          toast.success('Added to suppression database', `+${record.addedRows} contacts · ${record.rowCount} total${skipped}`);
          window.dispatchEvent(new CustomEvent('suppression-data-updated'));
          if ((record.skippedDuplicates ?? 0) > 0) {
            setDuplicateModal({
              fileName: payload.fileName,
              headers: duplicatePreview?.headers ?? payload.headers,
              duplicateRows: duplicatePreview?.duplicateRows ?? [],
              addedRows: record.addedRows ?? 0,
              duplicateCount:
                record.skippedDuplicates ?? duplicatePreview?.duplicateRows.length ?? 0,
              totalRows: record.rowCount,
            });
          }
        } else {
          toast.success('Saved to database', `${record.rowCount} contacts in suppression data`);
          window.dispatchEvent(new CustomEvent('suppression-data-updated'));
        }
      } catch (e) {
        toast.error('Could not save to MongoDB', extractApiError(e, 'Save failed'));
        throw e;
      } finally { setSavingDb(false); }
    },
    [applyRecord, logUploadActivity],
  );

  const saveEditsToDb = useCallback(async () => {
    if (!data) return;
    await persistToDb(data, 'replace');
  }, [data, persistToDb]);

  const loadCoverage = useCallback(async () => {
    try {
      const c = await deliveredDataService.getBatchCoverage();
      setCoverage(c);
    } catch {
      setCoverage(null);
    }
  }, []);

  const loadFromDb = useCallback(async () => {
    setLoadingDb(true); setError('');
    try {
      const record = await deliveredDataService.getCurrent();
      if (record) applyRecord(record);
      await loadCoverage();
    } catch {
      setCoverage(null);
    } finally { setLoadingDb(false); }
  }, [applyRecord, loadCoverage]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  useEffect(() => {
    const refresh = () => loadCoverage();
    window.addEventListener('suppression-data-updated', refresh);
    window.addEventListener('suppression-batch-created', refresh);
    return () => {
      window.removeEventListener('suppression-data-updated', refresh);
      window.removeEventListener('suppression-batch-created', refresh);
    };
  }, [loadCoverage]);

  const processFile = useCallback(async (file: File) => {
    setParsing(true); setError('');
    try {
      const parsed = await parseSpreadsheetFile(file);
      await persistToDb(parsed, replaceOnUpload ? 'replace' : 'append');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to read file';
      setError(msg);
      if (!(e as { response?: unknown })?.response) setData(null);
      toast.error('Upload failed', extractApiError(e, msg));
    } finally { setParsing(false); }
  }, [persistToDb, replaceOnUpload]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDownloadFormatted = async () => {
    if (!data) return;
    try {
      await downloadSpreadsheetXlsx({ ...data, rows: filteredRows.length > 0 || data.rows.length === 0 ? filteredRows : data.rows });
      toast.success('Download started', 'Excel file with current filters');
    } catch { toast.error('Export failed', 'Could not create Excel file'); }
  };

  const handleDownloadDuplicates = async () => {
    if (!duplicateModal) return;
    try {
      await downloadSpreadsheetXlsx(
        {
          fileName: duplicateModal.fileName,
          sheetName: 'Duplicates',
          headers: duplicateModal.headers,
          rows: duplicateModal.duplicateRows,
        },
        duplicateModal.fileName.replace(/\.(csv|xlsx|xls)$/i, '') + '-duplicates.xlsx',
      );
      toast.success(
        'Duplicate file downloaded',
        `${duplicateModal.duplicateCount} duplicate contact(s) exported`,
      );
    } catch {
      toast.error('Download failed', 'Could not export duplicate contacts');
    }
  };

  const handleSampleTemplate = async () => {
    try {
      await downloadSpreadsheetXlsx(getSampleMasterData(), 'suppression-data-template.xlsx');
      toast.info('Template downloaded', 'Fill and upload');
    } catch { toast.error('Download failed', 'Could not create template'); }
  };

  const confirmClearData = async () => {
    setClearing(true);
    try {
      const result = await deliveredDataService.clear();
      setData(null);
      setFilteredRows([]);
      setTotalRows(0);
      setSavedAt(null);
      setCoverage(null);
      setError('');
      setDirty(false);
      setClearModalOpen(false);
      const n = result.deletedBatches ?? 0;
      toast.success(
        'Suppression data removed',
        `${n} suppression campaign${n === 1 ? '' : 's'} deleted from database`,
      );
      window.dispatchEvent(new CustomEvent('suppression-data-cleared'));
    } catch (e) {
      toast.error('Clear failed', extractApiError(e, 'Could not clear data'));
    } finally {
      setClearing(false);
    }
  };

  // ── Open batch modal ──
  const openBatchModal = useCallback(
    (payload: { rows: string[][]; headers: string[]; sourceRowIndices: number[] }) => {
      if (!payload.sourceRowIndices.length) {
        toast.error('No contacts selected', 'Apply filters or pick contacts that are not already in a suppression campaign');
        return;
      }
      const now = new Date().toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      setBatchName(`VOIP Delivered ${now}`);
      setBatchDesc('');
      setCampaignChannel('voip');
      setBatchModal(payload);
    },
    [],
  );

  useEffect(() => {
    if (!batchModal) return;
    setCampaignChannel(detectChannelFromName(batchName));
  }, [batchName, batchModal]);

  // ── Save batch ──
  const handleSaveBatch = async () => {
    if (!batchModal || !batchName.trim()) return;
    setSavingBatch(true);
    try {
      const result = await deliveredDataService.createBatch({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        deliveredSourceRowIndices: batchModal.sourceRowIndices,
      });
      await loadCoverage();
      if (result.batch) {
        toast.success(
          'Batch created',
          `"${result.batch.name}" — ${result.batch.rowCount} contacts`,
        );
      } else if (result.duplicateCount > 0) {
        toast.info('Only duplicates found', `${result.duplicateCount} duplicate contact(s) moved to duplicate file`);
      }
      setBatchModal(null);
      if (result.duplicateCount > 0) {
        setDuplicateModal({
          fileName: data?.fileName ?? 'suppression-batch',
          headers: batchModal.headers,
          duplicateRows: result.duplicatePreviewRows,
          addedRows: result.uniqueRowCount,
          duplicateCount: result.duplicateCount,
          totalRows: data?.rows.length ?? 0,
          duplicatesBatchName: result.duplicatesBatchName ?? undefined,
        });
      } else if (result.batch) {
        router.push('/admin/batches');
      }
    } catch (e) {
      toast.error('Suppression campaign creation failed', extractApiError(e, 'Could not create suppression campaign'));
    } finally { setSavingBatch(false); }
  };

  const busy = parsing || savingDb || loadingDb;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-2 border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-800">Suppression File Upload</span>
          {data ? (
            <>
              <span className="hidden text-slate-400 sm:inline">|</span>
              <span className="max-w-[140px] truncate text-xs text-slate-600 sm:max-w-[200px]" title={data.fileName}>
                {data.fileName}
              </span>
              <span className="text-xs font-medium text-slate-700">{totalRows} contacts in DB</span>
              {coverage && coverage.summary.totalRows > 0 && (
                <>
                  <span className="text-xs text-amber-800">
                    {coverage.summary.batchedRows.toLocaleString('en-US')} in campaign
                  </span>
                  <span className="text-xs font-medium text-[#217346]">
                    {coverage.summary.availableRows.toLocaleString('en-US')} available
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-500">No data in suppression database yet</span>
          )}
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-[#217346]">
              <Cloud className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Saved {new Date(savedAt).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE,  dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </span>
          )}
          <AutoSaveHint status={autoSaveStatus} />
          {(savingDb || loadingDb) && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {loadingDb ? 'Loading…' : 'Saving…'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs hover:bg-[#fafafa] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {data ? 'Open file' : 'Upload'}
          </button>
          {canExport && (
            <button
              type="button"
              onClick={handleSampleTemplate}
              className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs hover:bg-[#fafafa]"
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
          )}
          {data && (
            <button
              type="button"
              onClick={saveEditsToDb}
              disabled={savingDb || !dirty}
              className="inline-flex items-center gap-1.5 border border-[#217346] bg-[#217346] px-3 py-1 text-xs text-white hover:bg-[#1a5c38] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save now
            </button>
          )}
          {data && canExport && (
            <>
              <button
                type="button"
                onClick={handleDownloadFormatted}
                className="inline-flex items-center gap-1.5 bg-[#217346] text-white px-3 py-1 text-xs hover:bg-[#1a5c38]"
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => setClearModalOpen(true)}
                disabled={savingDb || clearing}
                className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />

      {error && !data && (
        <div className="px-4 py-2 text-xs text-red-800 bg-red-50 border-b border-red-200">{error}</div>
      )}

      {loadingDb && !data ? (
        <div className="flex-1 flex items-center justify-center bg-white min-h-[400px] text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading suppression data from database…
        </div>
      ) : !data ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex-1 flex flex-col items-center justify-center border-b border-[#d4d4d4] bg-white min-h-[400px]',
            dragOver && 'bg-[#e7f3ff]',
            parsing && 'opacity-60 pointer-events-none',
          )}
        >
          <p className="text-sm text-slate-600">
            Drop <span className="font-medium">.xlsx</span>, <span className="font-medium">.xls</span>, or{' '}
            <span className="font-medium">.csv</span> here
          </p>
          <p className="mt-1 text-xs text-slate-400">Data is stored in MongoDB after upload</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-0 bg-[#e6e6e6]">
          <ExcelPreviewGrid
            data={data}
            dataResetKey={savedAt ?? 'suppression-empty'}
            editable
            onDataChange={handleGridChange}
            onFilteredDataChange={setFilteredRows}
            batchedByRow={coverage?.batchedByRow}
            hideBatchedRows={hideBatchedRows}
            onHideBatchedRowsChange={setHideBatchedRows}
            onCreateBatch={openBatchModal}
            fillHeight
          />
        </div>
      )}

      {/* ── Create Batch Modal ── */}
      {batchModal && (
        <>
          <div
            onClick={() => setBatchModal(null)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-suppression-batch-title"
              className="pointer-events-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="create-suppression-batch-title" className="font-semibold text-slate-900">
                    Create Suppression Campaign
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
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
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Campaign Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g. VOIP Delivered — Jun 2026"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Campaign channel
                  </label>
                  <select
                    value={campaignChannel}
                    onChange={(e) => setCampaignChannel(e.target.value as CampaignChannel)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {(Object.keys(CHANNEL_LABELS) as CampaignChannel[]).map((ch) => (
                      <option key={ch} value={ch}>
                        {CHANNEL_LABELS[ch]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Delivered data is filed in <span className="font-medium">Campaigns</span> under{' '}
                    <span className="font-medium">{CHANNEL_LABELS[campaignChannel]}</span> (auto-detected from name).
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={batchDesc}
                    onChange={(e) => setBatchDesc(e.target.value)}
                    placeholder="What is this suppression campaign for?"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">Campaign summary</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{batchModal.rows.length.toLocaleString('en-US')}</span> contacts selected
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="text-xs leading-relaxed text-emerald-800">
                      Suppression file holds delivered data only. On create, contacts are compressed (deduped) then uploaded to a{' '}
                      <span className="font-semibold text-indigo-700">{CHANNEL_LABELS[campaignChannel]}</span> campaign in{' '}
                      <span className="font-semibold">Campaigns</span> (year → month folder).
                      Duplicates go to the monthly duplicate file.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Columns ({batchModal.headers.length})
                    </p>
                    <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:max-h-32">
                      <div className="flex flex-wrap gap-1.5">
                        {batchModal.headers.map((header) => (
                          <span
                            key={header}
                            className="inline-block max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
                            title={header}
                          >
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {data?.fileName && (
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Source
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-600" title={data.fileName}>
                        {data.fileName}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setBatchModal(null)}
                    className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBatch}
                    disabled={savingBatch || !batchName.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 sm:flex-1"
                  >
                    {savingBatch && <Loader2 className="h-4 w-4 animate-spin" />}
                    {savingBatch ? 'Creating...' : 'Create Suppression Campaign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {duplicateModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <p className="font-semibold text-slate-900">Duplicate contacts found</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Upload completed, but some contacts were skipped as duplicates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close duplicate summary"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Duplicates</p>
                    <p className="mt-1 text-2xl font-bold text-amber-700">
                      {duplicateModal.duplicateCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Added</p>
                    <p className="mt-1 text-2xl font-bold text-[#217346]">
                      {duplicateModal.addedRows}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total DB contacts</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {duplicateModal.totalRows}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">
                    {duplicateModal.duplicateCount} contact(s) were already in a campaign
                    or repeated in your selection.
                  </p>
                  {duplicateModal.duplicatesBatchName && (
                    <p className="mt-1 text-xs text-amber-800">
                      Saved to duplicate file: <span className="font-semibold">{duplicateModal.duplicatesBatchName}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-800">
                    Download the duplicate sheet to review them. This popup will stay open until you close it manually.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-slate-100 px-6 pb-5 pt-4">
                <button
                  type="button"
                  onClick={handleDownloadDuplicates}
                  disabled={duplicateModal.duplicateRows.length === 0}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#217346] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a5c38] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download duplicates
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <SuppressionDataClearConfirmModal
        open={clearModalOpen}
        onClose={() => !clearing && setClearModalOpen(false)}
        onConfirm={confirmClearData}
        clearing={clearing}
      />
    </div>
  );
}
