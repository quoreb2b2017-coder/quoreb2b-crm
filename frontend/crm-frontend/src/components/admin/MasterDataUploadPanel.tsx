'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, Cloud, Loader2, Save, Database, Megaphone, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { downloadMasterDataTemplate } from '@/lib/spreadsheet/master-data-template';
import {
  parseSpreadsheetFile,
  type SpreadsheetData,
} from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  recordToSpreadsheet,
  type MasterBatchCoverage,
  type MasterDataCsvDownloadProgress,
} from '@/lib/api/master-data.service';
import { enqueueMasterDataImport } from '@/lib/master-data/master-data-import-tracker';
import {
  emitMasterDataDuplicatePopup,
  MASTER_DATA_UPLOAD_DUPLICATES_EVENT,
  type MasterDataDuplicatePopupDetail,
} from '@/lib/master-data/master-data-duplicate-popup';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { batchesService } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { useDebouncedAutoSave, type AutoSaveStatus } from '@/hooks/useDebouncedAutoSave';
import { DbAdminCampaignWizard } from '@/components/db-admin/DbAdminCampaignWizard';
import { MasterDatabaseExplorer, type MasterBatchCreatePayload } from '@/components/master-database/MasterDatabaseExplorer';

import {
  alignRowToMasterHeaders,
  prepareMasterDataSheet,
  resolveMasterDataHeaders,
} from '@/lib/spreadsheet/master-data-format';

const ACCEPT = '.csv,.xlsx,.xls';

function formatDownloadBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function MasterCsvDownloadSparkline({ history }: { history: number[] }) {
  if (history.length < 2) {
    return (
      <div className="flex h-16 w-full items-end gap-0.5 rounded-lg bg-slate-50 px-2 py-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-[#2e7ad1]/20"
            style={{ height: `${8 + (i % 4) * 4}px` }}
          />
        ))}
      </div>
    );
  }

  const width = 320;
  const height = 64;
  const points = history.map((value, index) => {
    const x = (index / Math.max(history.length - 1, 1)) * width;
    const y = height - (Math.min(100, Math.max(0, value)) / 100) * (height - 8) - 4;
    return `${x},${y}`;
  });
  const area = `${points.join(' ')} ${width},${height} 0,${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full rounded-lg bg-gradient-to-b from-[#e8f1fb] to-white"
      aria-hidden
    >
      <polygon points={area} fill="url(#csvDownloadFill)" opacity="0.55" />
      <polyline
        fill="none"
        stroke="#2e7ad1"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      <defs>
        <linearGradient id="csvDownloadFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e7ad1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2e7ad1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type MasterDataViewTab = 'total' | 'in_campaign' | 'remaining';

const MASTER_DATA_VIEW_TABS: Array<{
  id: MasterDataViewTab;
  label: string;
  shortLabel: string;
  description: string;
  filter: 'all' | 'in_campaign' | 'remaining';
  icon: typeof Database;
  tone: 'slate' | 'amber' | 'blue';
}> = [
  {
    id: 'total',
    label: 'Total data',
    shortLabel: 'Total',
    description: 'All contacts in master DB',
    filter: 'all',
    icon: Database,
    tone: 'slate',
  },
  {
    id: 'in_campaign',
    label: 'Used in campaign',
    shortLabel: 'In campaign',
    description: 'Already assigned to a campaign',
    filter: 'in_campaign',
    icon: Megaphone,
    tone: 'amber',
  },
  {
    id: 'remaining',
    label: 'Remaining data',
    shortLabel: 'Remaining',
    description: 'Available for new campaigns',
    filter: 'remaining',
    icon: CircleDot,
    tone: 'blue',
  },
];

function safeCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowKey(row: string[]) {
  return row.join('\u001f');
}

function cleanMasterFileName(name: string): string {
  return (
    name
      .replace(/-part-\d+-of-\d+/gi, '')
      .replace(/\s*\([\d,]+ rows\)\s*$/i, '')
      .trim() || name
  );
}

function collectDuplicateRows(
  existing: SpreadsheetData | null,
  incoming: SpreadsheetData,
) {
  const headers = resolveMasterDataHeaders();
  const seen = new Set(
    (existing?.rows ?? []).map((row) =>
      rowKey(alignRowToMasterHeaders(row, existing?.headers ?? [], headers)),
    ),
  );
  const duplicateRows: string[][] = [];

  for (const row of incoming.rows) {
    const aligned = alignRowToMasterHeaders(row, incoming.headers, headers);
    if (!aligned.some((cell) => cell.length > 0 && cell !== '-')) continue;
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
        ? 'text-[#2e7ad1]'
        : 'text-slate-500';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'saved' && <Cloud className="h-3 w-3" />}
      {label}
    </span>
  );
}

export type MasterDataPanelVariant = 'admin' | 'db_admin';

export function MasterDataUploadPanel({ variant = 'admin' }: { variant?: MasterDataPanelVariant }) {
  const isDbAdminView = variant === 'db_admin';
  const canExport = useCanExportSpreadsheet();
  const router = useRouter();
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [filteredRows, setFilteredRows] = useState<string[][]>([]);
  const [filteredViewActive, setFilteredViewActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true);
  const [savingDb, setSavingDb] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [replaceOnUpload, setReplaceOnUpload] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [previewSourceIndices, setPreviewSourceIndices] = useState<number[]>([]);
  const [isLargeDatasetPreview, setIsLargeDatasetPreview] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  // ── Batch create modal state ──
  const [coverage, setCoverage] = useState<MasterBatchCoverage | null>(null);
  const [dataViewTab, setDataViewTab] = useState<MasterDataViewTab>('total');
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
    masterSearchFilter?: MasterBatchCreatePayload['masterSearchFilter'];
    estimatedCount?: number;
    selectAllFiltered?: boolean;
  } | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const importPhase = useMasterDataImportStore((s) => s.uiPhase);
  const importProgress = useMasterDataImportStore((s) => s.progress);
  const importFileName = useMasterDataImportStore((s) => s.fileName);
  const [savingBatch, setSavingBatch] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    fileName: string;
    headers: string[];
    duplicateRows: string[][];
    addedRows: number;
    duplicateCount: number;
    totalRows: number;
  } | null>(null);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [csvDownloadProgress, setCsvDownloadProgress] =
    useState<MasterDataCsvDownloadProgress | null>(null);
  const [csvDownloadHistory, setCsvDownloadHistory] = useState<number[]>([]);

  const applyLargeDatasetRecord = useCallback(
    (record: Awaited<ReturnType<typeof masterDataService.getCurrent>> & { rowCount: number }) => {
      const fileName = cleanMasterFileName(record.fileName);
      const previewRows = record.rows ?? [];
      setIsLargeDatasetPreview(true);
      setFilteredViewActive(false);
      setTotalRows(safeCount(record.rowCount));
      setPreviewSourceIndices(record.previewSourceIndices ?? []);
      setData({
        fileName,
        sheetName: record.sheetName,
        headers: record.headers ?? [],
        rows: previewRows,
      });
      setFilteredRows(previewRows);
      setSavedAt(record.updatedAt ?? record.createdAt ?? new Date().toISOString());
      setDirty(false);
      lastPreviewMeta.current = { rowCount: safeCount(record.rowCount), fileName };
    },
    [],
  );

  const applyRecord = useCallback((record: Awaited<ReturnType<typeof masterDataService.save>>) => {
    const sheet = recordToSpreadsheet(record);
    setData(sheet);
    setFilteredRows(sheet.rows);
    setFilteredViewActive(false);
    setTotalRows(safeCount(record.rowCount));
    setIsLargeDatasetPreview(false);
    setPreviewSourceIndices([]);
    setSavedAt(record.updatedAt ?? record.createdAt ?? new Date().toISOString());
    setDirty(false);
    return sheet;
  }, []);

  const dataRef = useRef<SpreadsheetData | null>(null);
  const previewLoadGen = useRef(0);
  const lastPreviewMeta = useRef({ rowCount: 0, fileName: '' });
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
        const duplicatePreview =
          mode === 'append' ? collectDuplicateRows(dataRef.current, payload) : null;
        const record = await masterDataService.save(payload, mode);
        applyRecord(record);
        await logUploadActivity(mode, record, payload.fileName);
        if (mode === 'append' && record.addedRows != null) {
          const skipped = record.skippedDuplicates && record.skippedDuplicates > 0
            ? ` · ${record.skippedDuplicates} duplicate(s) skipped` : '';
          toast.success('Added to master database', `+${record.addedRows} contacts · ${record.rowCount} total${skipped}`);
          window.dispatchEvent(new CustomEvent('master-data-updated'));
          if ((record.skippedDuplicates ?? 0) > 0) {
            toast.info(
              'Duplicates saved to folder',
              `${record.skippedDuplicates?.toLocaleString()} duplicate(s) saved under Admin → Duplicates`,
            );
          }
        } else {
          toast.success('Saved to database', `${record.rowCount} contacts in master data`);
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
    setLoadingDb(true);
    setError('');
    try {
      const record = await masterDataService.getCurrent();
      if (!record) {
        setData(null);
        setTotalRows(0);
        setFilteredRows([]);
        setFilteredViewActive(false);
        await loadCoverage();
        return;
      }
      if (record.filterRequired) {
        const msg =
          'Master data exists but row data was not returned for this role. Open as Super Admin, or redeploy the latest backend.';
        setError(msg);
        setTotalRows(safeCount(record.rowCount));
        toast.error('Cannot load master grid', msg);
        return;
      }
      if (record.largeDataset || record.rowCount > 5000) {
        if ((record.rows?.length ?? 0) > 0) {
          applyLargeDatasetRecord(record);
          void loadCoverage();
          return;
        }

        const rowCount = record.rowCount;
        const fileName = cleanMasterFileName(record.fileName);
        const gen = ++previewLoadGen.current;
        setIsLargeDatasetPreview(true);
        setFilteredViewActive(false);
        setTotalRows(safeCount(rowCount));
        setSavedAt(record.updatedAt ?? record.createdAt ?? new Date().toISOString());
        setDirty(false);
        setData((prev) => ({
          fileName,
          sheetName: record.sheetName,
          headers: record.headers ?? prev?.headers ?? [],
          rows: [],
        }));
        setPreviewSourceIndices([]);
        setFilteredRows([]);
        void loadCoverage();

        try {
          const preview = await masterDataService.getPreview(100);
          if (gen !== previewLoadGen.current) return;
          const previewRows = preview.rows ?? [];
          if (!previewRows.length) {
            throw new Error('Preview returned 0 rows — data may still be saving');
          }
          applyLargeDatasetRecord({
            ...record,
            rows: previewRows,
            previewSourceIndices: preview.sourceRowIndices,
          });
        } catch (err) {
          if (gen !== previewLoadGen.current) return;
          toast.error(
            'Preview load failed',
            extractApiError(err, 'Could not load row preview — try refreshing the page'),
          );
        }
        return;
      }
      setIsLargeDatasetPreview(false);
      setPreviewSourceIndices([]);
      if (record.rowCount > 0 && (record.rows?.length ?? 0) === 0) {
        const msg =
          'Master data row count is set but no rows arrived from the API. Check backend deploy, CORS, and API timeout.';
        setError(msg);
        setTotalRows(safeCount(record.rowCount));
        toast.error('Master data incomplete', msg);
        return;
      }
      applyRecord(record);
      await loadCoverage();
    } catch (err) {
      setCoverage(null);
      const msg = extractApiError(
        err,
        'Could not load master data from API. Check NEXT_PUBLIC_API_URL and backend deploy.',
      );
      setError(msg);
      toast.error('Master data load failed', msg);
    } finally {
      setLoadingDb(false);
    }
  }, [applyRecord, applyLargeDatasetRecord, loadCoverage]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  useEffect(() => {
    const onDuplicates = (event: Event) => {
      const detail = (event as CustomEvent<MasterDataDuplicatePopupDetail>).detail;
      if (!detail || detail.duplicateCount <= 0) return;
      setDuplicateModal(detail);
    };
    window.addEventListener(MASTER_DATA_UPLOAD_DUPLICATES_EVENT, onDuplicates);
    return () => window.removeEventListener(MASTER_DATA_UPLOAD_DUPLICATES_EVENT, onDuplicates);
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        const hasPreview = (dataRef.current?.rows?.length ?? 0) > 0;
        const meta = lastPreviewMeta.current;
        if (hasPreview && meta.rowCount > 0) {
          void loadCoverage();
          void masterDataService.getCurrent().then((record) => {
            if (!record) return;
            setTotalRows(safeCount(record.rowCount));
            if (meta.rowCount !== safeCount(record.rowCount)) {
              void loadFromDb().catch(() => undefined);
            }
          }).catch(() => undefined);
          return;
        }
        void loadFromDb().catch(() => undefined);
      }, 1500);
    };
    window.addEventListener('master-data-updated', refresh);
    window.addEventListener('batch-created', refresh);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('master-data-updated', refresh);
      window.removeEventListener('batch-created', refresh);
    };
  }, [loadFromDb]);

  const processFile = useCallback((file: File) => {
    setError('');
    try {
      masterDataService.validateUploadFile(file);
      const mode = replaceOnUpload ? 'replace' : 'append';
      void enqueueMasterDataImport(file, mode).catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to read file';
        setError(msg);
        toast.error('Upload failed', extractApiError(e, msg));
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to read file';
      setError(msg);
      toast.error('Upload failed', extractApiError(e, msg));
    }
  }, [replaceOnUpload]);

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
      await downloadSpreadsheetXlsx({
        ...data,
        rows: filteredViewActive ? filteredRows : data.rows,
      });
      toast.success('Download started', filteredViewActive ? 'Excel file with current filters' : 'Full master data export');
    } catch { toast.error('Export failed', 'Could not create Excel file'); }
  };

  const handleDownloadMasterCsv = async () => {
    if (csvDownloading) return;
    let exportedRows = totalRows;
    try {
      setCsvDownloading(true);
      setCsvDownloadProgress(null);
      setCsvDownloadHistory([]);
      await masterDataService.downloadMasterCsv({
        totalRowsHint: totalRows,
        onProgress: (progress) => {
          exportedRows = progress.totalRows || progress.rowsDownloaded || totalRows;
          setCsvDownloadProgress(progress);
          setCsvDownloadHistory((prev) => {
            const next = [...prev, progress.percent];
            return next.length > 48 ? next.slice(next.length - 48) : next;
          });
        },
      });
      toast.success(
        'Download complete',
        `${exportedRows.toLocaleString('en-US')} rows exported as CSV`,
      );
    } catch (e) {
      toast.error('Download failed', extractApiError(e, 'Could not export CSV'));
    } finally {
      setCsvDownloading(false);
      setCsvDownloadProgress(null);
      setCsvDownloadHistory([]);
    }
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

  const handleSampleTemplate = () => {
    try {
      downloadMasterDataTemplate();
      toast.info('Template downloaded', 'Fill and upload');
    } catch {
      toast.error('Download failed', 'Could not download template');
    }
  };

  // ── Open batch modal ──
  const openBatchModal = useCallback(
    (payload: MasterBatchCreatePayload) => {
      const count = payload.estimatedCount ?? payload.sourceRowIndices?.length ?? 0;
      if (!count) {
        toast.error('No contacts selected', 'Apply filters or pick contacts that are not already in a campaign');
        return;
      }
      const now = new Date().toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      setBatchName(`Campaign ${now}`);
      setBatchDesc('');
      setBatchModal({
        headers: payload.headers,
        rows: payload.rows ?? [],
        sourceRowIndices: payload.sourceRowIndices ?? [],
        masterSearchFilter: payload.masterSearchFilter,
        estimatedCount: count,
        selectAllFiltered: payload.selectAllFiltered,
      });
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
        masterSourceRowIndices: batchModal.sourceRowIndices?.length
          ? batchModal.sourceRowIndices
          : undefined,
        masterSearchFilter: batchModal.masterSearchFilter,
      });
      await loadCoverage();
      toast.success('Campaign created!', `"${batch.name}" — ${batch.rowCount} contacts`);
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
      toast.error('Campaign creation failed', extractApiError(e, 'Could not create campaign'));
    } finally { setSavingBatch(false); }
  };

  const busy = parsing || savingDb || loadingDb;

  const coverageStats = {
    total: safeCount(coverage?.summary?.totalRows ?? totalRows),
    inCampaign: safeCount(coverage?.summary?.batchedRows),
    remaining: safeCount(coverage?.summary?.availableRows ?? totalRows),
  };

  const activeViewTab =
    MASTER_DATA_VIEW_TABS.find((tab) => tab.id === dataViewTab) ?? MASTER_DATA_VIEW_TABS[0];

  const tabCounts: Record<MasterDataViewTab, number> = {
    total: coverageStats.total,
    in_campaign: coverageStats.inCampaign,
    remaining: coverageStats.remaining,
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-2 border-b border-slate-200/90 bg-gradient-to-r from-[#f8fafc] via-white to-[#f8fafc] px-3 py-2.5 text-sm shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#2e7ad1] text-[9px] font-bold text-white">
              DB
            </span>
            Master database
          </span>
          {data ? (
            <>
              <span className="hidden text-slate-400 sm:inline">|</span>
              <span className="max-w-[140px] truncate text-xs text-slate-600 sm:max-w-[200px]" title={data.fileName}>
                {data.fileName}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-500">No data in master database yet</span>
          )}
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-[#2e7ad1]">
              <Cloud className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Saved {new Date(savedAt).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE,  dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </span>
          )}
          <AutoSaveHint status={isDbAdminView ? 'idle' : autoSaveStatus} />
          {csvDownloading && csvDownloadProgress && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Download {Math.round(csvDownloadProgress.percent)}%
            </span>
          )}
          {importPhase === 'active' && importProgress && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1fb] px-2.5 py-0.5 text-xs font-semibold text-[#2e7ad1]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Upload {Math.round(importProgress.percent)}%
            </span>
          )}
          {(savingDb || loadingDb) && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {loadingDb ? 'Loading…' : 'Saving…'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {!isDbAdminView && (
            <>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb] disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" />{data ? 'Upload file' : 'Upload'}
              </button>
              {canExport && (
                <button type="button" onClick={handleSampleTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb]">
                  <Download className="h-3.5 w-3.5" />Template
                </button>
              )}
            </>
          )}
          {!isDbAdminView && data && (
            <button
              type="button"
              onClick={saveEditsToDb}
              disabled={savingDb || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e7ad1] bg-[#2e7ad1] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#2568b8] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save now
            </button>
          )}
          {!isDbAdminView && data && canExport && (
            <>
              <button type="button" onClick={() => void handleDownloadMasterCsv()}
                disabled={csvDownloading || totalRows <= 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb] disabled:opacity-50">
                <Download className="h-3.5 w-3.5" />
                {csvDownloading ? 'Downloading…' : 'Download CSV'}
              </button>
              <button type="button" onClick={handleDownloadFormatted}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2e7ad1] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#2568b8]">
                <Download className="h-3.5 w-3.5" />Export Excel
              </button>
            </>
          )}
        </div>
      </div>

      {!isDbAdminView && data && (
        <div className="border-b border-slate-200/90 bg-gradient-to-b from-slate-50 to-white px-3 py-3 sm:px-4">
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="tablist"
            aria-label="Master data views"
          >
            {MASTER_DATA_VIEW_TABS.map((tab) => {
              const active = dataViewTab === tab.id;
              const Icon = tab.icon;
              const count = safeCount(tabCounts[tab.id]).toLocaleString('en-US');
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDataViewTab(tab.id)}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200',
                    active
                      ? tab.tone === 'amber'
                        ? 'border-amber-300/80 bg-gradient-to-br from-amber-50 to-white shadow-md shadow-amber-100/60 ring-2 ring-amber-400/35'
                        : tab.tone === 'blue'
                          ? 'border-[#2e7ad1]/35 bg-gradient-to-br from-[#e8f1fb] to-white shadow-md shadow-[#2e7ad1]/10 ring-2 ring-[#2e7ad1]/30'
                          : 'border-slate-300/80 bg-white shadow-md shadow-slate-200/50 ring-2 ring-[#2e7ad1]/25'
                      : 'border-slate-200/90 bg-white/80 hover:border-slate-300 hover:bg-white hover:shadow-sm',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      active
                        ? tab.tone === 'amber'
                          ? 'border-amber-200 bg-amber-100 text-amber-800'
                          : tab.tone === 'blue'
                            ? 'border-[#2e7ad1]/25 bg-[#2e7ad1] text-white'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-700',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.shortLabel}</span>
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block text-xl font-bold tabular-nums leading-none tracking-tight',
                        active
                          ? tab.tone === 'amber'
                            ? 'text-amber-950'
                            : tab.tone === 'blue'
                              ? 'text-[#1d5a9e]'
                              : 'text-slate-900'
                          : 'text-slate-800',
                      )}
                    >
                      {count}
                    </span>
                    <span className="mt-1 hidden text-[11px] leading-snug text-slate-500 sm:block">
                      {tab.description}
                    </span>
                  </span>
                  {active && (
                    <span
                      className={cn(
                        'absolute bottom-0 left-4 right-4 h-0.5 rounded-full',
                        tab.tone === 'amber'
                          ? 'bg-amber-500'
                          : tab.tone === 'blue'
                            ? 'bg-[#2e7ad1]'
                            : 'bg-slate-400',
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />

      {error && (
        <div className="px-4 py-2 text-xs text-red-800 bg-red-50 border-b border-red-200">{error}</div>
      )}

      {loadingDb && !data ? (
        <div className="flex-1 flex items-center justify-center bg-white min-h-[400px] text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading master data from database…
        </div>
      ) : !data ? (
        <div
          onDragOver={isDbAdminView ? undefined : (e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={isDbAdminView ? undefined : () => setDragOver(false)}
          onDrop={isDbAdminView ? undefined : onDrop}
          className={cn(
            'flex-1 flex flex-col items-center justify-center border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 min-h-[400px]',
            !isDbAdminView && dragOver && 'bg-[#e7f3ff]',
            !isDbAdminView && parsing && 'opacity-60 pointer-events-none',
          )}
        >
          {isDbAdminView ? (
            <>
              <p className="text-sm text-slate-600">Master file is not available yet.</p>
              <p className="mt-1 text-xs text-slate-400">Ask Super Admin to upload master data.</p>
            </>
          ) : (
            <>
              {importPhase === 'active' && importProgress ? (
                <div className="flex w-full max-w-md flex-col items-center gap-3 px-6">
                  <Loader2 className="h-8 w-8 animate-spin text-[#2e7ad1]" />
                  <p className="text-sm font-semibold text-slate-800">Uploading master data</p>
                  {importFileName && (
                    <p className="truncate text-xs text-slate-500" title={importFileName}>
                      {importFileName}
                    </p>
                  )}
                  <p className="text-xs text-slate-600">{importProgress.message}</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-500"
                      style={{ width: `${Math.round(importProgress.percent)}%` }}
                    />
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[#2e7ad1]">
                    {Math.round(importProgress.percent)}%
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Drop <span className="font-medium">.xlsx</span>, <span className="font-medium">.xls</span>, or{' '}
                    <span className="font-medium">.csv</span> here
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Data is stored in MongoDB after upload</p>
                </>
              )}
            </>
          )}
        </div>
      ) : !isDbAdminView && data && (isLargeDatasetPreview || totalRows > 5000) ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <MasterDatabaseExplorer
            variant="db_admin"
            embedded
            campaignRowFilter={activeViewTab.filter}
            onCreateBatch={openBatchModal}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-0 bg-slate-100">
          {isLargeDatasetPreview && totalRows > 0 && (
            <div className="border-b border-[#2e7ad1]/20 bg-[#e8f1fb] px-4 py-2 text-xs text-[#1d5a9e]">
              <strong>{safeCount(totalRows).toLocaleString('en-US')} contacts</strong> saved in master database.
              Grid shows the first {(data.rows?.length ?? 0).toLocaleString('en-US')} rows as preview.
            </div>
          )}
          <ExcelPreviewGrid
            data={data}
            dataResetKey={savedAt ?? 'master-empty'}
            editable={!isDbAdminView}
            onDataChange={isDbAdminView ? undefined : handleGridChange}
            onFilteredDataChange={setFilteredRows}
            onFilteredViewChange={({ hasActiveViewFilter }) => setFilteredViewActive(hasActiveViewFilter)}
            batchedByRow={coverage?.batchedByRow}
            campaignRowFilter={!isDbAdminView ? activeViewTab.filter : undefined}
            onCreateBatch={openBatchModal}
            fillHeight
            datasetRowCount={totalRows > 0 ? totalRows : undefined}
            externalSourceIndices={
              (previewSourceIndices?.length ?? 0) > 0 ? previewSourceIndices : undefined
            }
          />
        </div>
      )}

      {/* ── DB Admin: Extract → Suppression → Distribute wizard ── */}
      {isDbAdminView && batchModal && (
        <DbAdminCampaignWizard
          open
          onClose={() => setBatchModal(null)}
          headers={batchModal.headers}
          rows={batchModal.rows}
          sourceRowIndices={batchModal.sourceRowIndices}
          sourceFileName={data?.fileName}
          onCreated={() => {
            void loadCoverage();
            setBatchModal(null);
          }}
        />
      )}

      {/* ── Admin: Create Batch Modal ── */}
      {!isDbAdminView && batchModal && (
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
              aria-labelledby="create-campaign-title"
              className="pointer-events-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="create-campaign-title" className="font-semibold text-slate-900">
                    Create New Campaign
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {(batchModal.estimatedCount ?? batchModal.rows.length).toLocaleString('en-US')} contacts
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
                    placeholder="e.g. IT Companies - May 2025"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Auto-fills <strong>Campaign Vertical</strong> on every row (overwrites existing
                    values).
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={batchDesc}
                    onChange={(e) => setBatchDesc(e.target.value)}
                    placeholder="What is this campaign for?"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">Campaign summary</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {(batchModal.estimatedCount ?? batchModal.rows.length).toLocaleString('en-US')}
                      </span>{' '}
                      contacts selected
                      {batchModal.selectAllFiltered ? ' (all filtered matches — loaded on server)' : ''}
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="text-xs leading-relaxed text-[#2568b8]">
                      Master data stays unchanged. Campaign contacts remain in the database and show as{' '}
                      <span className="font-semibold text-amber-700">&quot;In campaign&quot;</span> (yellow) so
                      you can pick only new contacts next time.
                      {isDbAdminView && (
                        <>
                          {' '}
                          After creating, the campaign opens in{' '}
                          <span className="font-semibold">All campaigns</span> (year → month folder).
                        </>
                      )}
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e7ad1] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2568b8] disabled:opacity-60 sm:flex-1"
                  >
                    {savingBatch && <Loader2 className="h-4 w-4 animate-spin" />}
                    {savingBatch ? 'Creating...' : 'Create Campaign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {csvDownloading && (
        <>
          <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="font-semibold text-slate-900">Downloading master database</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Full CSV export — no row limit for Super Admin
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <MasterCsvDownloadSparkline history={csvDownloadHistory} />
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-300"
                    style={{ width: `${Math.round(csvDownloadProgress?.percent ?? 0)}%` }}
                  />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-bold tabular-nums text-[#2e7ad1]">
                      {Math.round(csvDownloadProgress?.percent ?? 0)}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Download progress</p>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <p className="font-semibold tabular-nums text-slate-800">
                      {(csvDownloadProgress?.rowsDownloaded ?? 0).toLocaleString('en-US')}
                      {' / '}
                      {(csvDownloadProgress?.totalRows ?? totalRows).toLocaleString('en-US')}
                      {' rows'}
                    </p>
                    <p className="mt-0.5 tabular-nums text-slate-500">
                      {formatDownloadBytes(csvDownloadProgress?.bytesDownloaded ?? 0)} received
                    </p>
                  </div>
                </div>
                <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2e7ad1]" />
                  Streaming full database — please keep this tab open
                </p>
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
                      {duplicateModal.duplicateCount.toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Added</p>
                    <p className="mt-1 text-2xl font-bold text-[#2e7ad1]">
                      {duplicateModal.addedRows.toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total DB contacts</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {duplicateModal.totalRows.toLocaleString('en-US')}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">
                    {duplicateModal.duplicateCount.toLocaleString('en-US')} contact(s) were already present in the master database
                    or repeated inside the uploaded file.
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {duplicateModal.duplicateRows.length > 0
                      ? 'Download the duplicate sheet to review them.'
                      : 'Large import — duplicate list is not stored, but the count above is accurate.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-slate-100 px-6 pb-5 pt-4">
                <button
                  type="button"
                  onClick={handleDownloadDuplicates}
                  disabled={duplicateModal.duplicateRows.length === 0}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2e7ad1] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2568b8] disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
