'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  masterDataService,
  recordToSpreadsheet,
  type MasterBatchCoverage,
} from '@/lib/api/master-data.service';
import { batchesService } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { useDebouncedAutoSave, type AutoSaveStatus } from '@/hooks/useDebouncedAutoSave';

const ACCEPT = '.csv,.xlsx,.xls';

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

export function MasterDataUploadPanel() {
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
  const [coverage, setCoverage] = useState<MasterBatchCoverage | null>(null);
  const [hideBatchedRows, setHideBatchedRows] = useState(false);
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  } | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  const applyRecord = useCallback((record: Awaited<ReturnType<typeof masterDataService.save>>) => {
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
      const record = await masterDataService.save(payload, 'replace');
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
    async (mode: 'append' | 'replace', record: Awaited<ReturnType<typeof masterDataService.save>>, fileName: string) => {
      try {
        await activityLogsService.track({
          action: 'MASTER_DATA_UPLOAD',
          resource: 'master-data',
          path: '/admin/master-data-upload',
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
        const record = await masterDataService.save(payload, mode);
        applyRecord(record);
        await logUploadActivity(mode, record, payload.fileName);
        if (mode === 'append' && record.addedRows != null) {
          const skipped = record.skippedDuplicates && record.skippedDuplicates > 0
            ? ` · ${record.skippedDuplicates} duplicate(s) skipped` : '';
          toast.success('Added to master database', `+${record.addedRows} rows · ${record.rowCount} total${skipped}`);
        window.dispatchEvent(new CustomEvent('master-data-updated'));
        } else {
          toast.success('Saved to database', `${record.rowCount} rows in master data`);
        window.dispatchEvent(new CustomEvent('master-data-updated'));
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
      const c = await masterDataService.getBatchCoverage();
      setCoverage(c);
    } catch {
      setCoverage(null);
    }
  }, []);

  const loadFromDb = useCallback(async () => {
    setLoadingDb(true); setError('');
    try {
      const record = await masterDataService.getCurrent();
      if (record) applyRecord(record);
      await loadCoverage();
    } catch {
      setCoverage(null);
    } finally { setLoadingDb(false); }
  }, [applyRecord, loadCoverage]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  useEffect(() => {
    const refresh = () => loadCoverage();
    window.addEventListener('master-data-updated', refresh);
    window.addEventListener('batch-created', refresh);
    return () => {
      window.removeEventListener('master-data-updated', refresh);
      window.removeEventListener('batch-created', refresh);
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

  const handleSampleTemplate = async () => {
    try {
      await downloadSpreadsheetXlsx(getSampleMasterData(), 'master-data-template.xlsx');
      toast.info('Template downloaded', 'Fill and upload');
    } catch { toast.error('Download failed', 'Could not create template'); }
  };

  const clearData = async () => {
    if (
      !window.confirm(
        'Delete ALL master data and every batch from the database? This cannot be undone.',
      )
    ) {
      return;
    }
    try {
      const result = await masterDataService.clear();
      setData(null);
      setFilteredRows([]);
      setTotalRows(0);
      setSavedAt(null);
      setCoverage(null);
      setError('');
      const n = result.deletedBatches ?? 0;
      toast.success(
        'All data cleared',
        `Master data removed · ${n} batch${n === 1 ? '' : 'es'} deleted from database`,
      );
    } catch (e) {
      toast.error('Clear failed', extractApiError(e, 'Could not clear data'));
    }
  };

  // ── Open batch modal ──
  const openBatchModal = useCallback(
    (payload: { rows: string[][]; headers: string[]; sourceRowIndices: number[] }) => {
      const now = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      setBatchName(`Batch ${now}`);
      setBatchDesc('');
      setBatchModal(payload);
    },
    [],
  );

  // ── Save batch ──
  const handleSaveBatch = async () => {
    if (!batchModal || !batchName.trim()) return;
    setSavingBatch(true);
    try {
      const batch = await batchesService.create({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        headers: batchModal.headers,
        rows: batchModal.rows,
        sourceFileName: data?.fileName,
        masterSourceRowIndices: batchModal.sourceRowIndices,
      });
      await loadCoverage();
      toast.success('Batch created!', `"${batch.name}" — ${batch.rowCount} rows`);
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
    } catch (e) {
      toast.error('Batch creation failed', extractApiError(e, 'Could not create batch'));
    } finally { setSavingBatch(false); }
  };

  const busy = parsing || savingDb || loadingDb;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#d4d4d4] bg-[#f3f3f3] px-4 py-2 text-sm">
        <span className="font-semibold text-slate-800">Master Data Upload</span>
        <span className="hidden sm:inline text-slate-400">|</span>
        {data ? (
          <>
            <span className="text-xs text-slate-600 truncate max-w-[200px]">{data.fileName}</span>
            <span className="text-xs font-medium text-slate-700">{totalRows} rows in DB</span>
            {coverage && coverage.summary.totalRows > 0 && (
              <>
                <span className="text-xs text-amber-800">
                  {coverage.summary.batchedRows.toLocaleString('en-IN')} in batch
                </span>
                <span className="text-xs font-medium text-[#217346]">
                  {coverage.summary.availableRows.toLocaleString('en-IN')} available for new batch
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-500">No data in master database yet</span>
        )}
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-xs text-[#217346]">
            <Cloud className="h-3 w-3" />
            Saved {new Date(savedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        <AutoSaveHint status={autoSaveStatus} />
        {(savingDb || loadingDb) && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            {loadingDb ? 'Loading…' : 'Saving…'}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs hover:bg-[#fafafa] disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />{data ? 'Open file' : 'Upload'}
          </button>
          <button type="button" onClick={handleSampleTemplate}
            className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs hover:bg-[#fafafa]">
            <Download className="h-3.5 w-3.5" />Template
          </button>
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
          {data && (
            <>
              <button type="button" onClick={handleDownloadFormatted}
                className="inline-flex items-center gap-1.5 bg-[#217346] text-white px-3 py-1 text-xs hover:bg-[#1a5c38]">
                <Download className="h-3.5 w-3.5" />Export Excel
              </button>
              <button type="button" onClick={clearData} disabled={savingDb}
                className="inline-flex items-center gap-1.5 border border-[#ababab] bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />Clear
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading master data from database…
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
            dataResetKey={savedAt ?? 'master-empty'}
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
          <div onClick={() => setBatchModal(null)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <p className="font-semibold text-slate-900">Create New Batch</p>
                  <p className="text-xs text-slate-400 mt-0.5">{batchModal.rows.length} rows · {batchModal.headers.length} columns</p>
                </div>
                <button onClick={() => setBatchModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Batch Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                    placeholder="e.g. IT Companies - May 2025"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                  <textarea
                    value={batchDesc}
                    onChange={e => setBatchDesc(e.target.value)}
                    placeholder="What is this batch for?"
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500 space-y-1">
                  <p><span className="font-medium text-slate-700">Rows in this batch:</span> {batchModal.rows.length}</p>
                  <p className="text-[#217346]">
                    Master data is unchanged — batched rows stay in the database and show as
                    &quot;In batch&quot; (yellow) so you can pick only new rows next time.
                  </p>
                  <p><span className="font-medium text-slate-700">Columns:</span> {batchModal.headers.join(', ')}</p>
                  {data?.fileName && <p><span className="font-medium text-slate-700">Source:</span> {data.fileName}</p>}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setBatchModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSaveBatch}
                  disabled={savingBatch || !batchName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {savingBatch && <Loader2 className="w-4 h-4 animate-spin" />}
                  {savingBatch ? 'Creating...' : 'Create Batch'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
