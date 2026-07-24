import { todayDateKey } from '@/lib/constants/workspace-timezone';
import type { ActivityLogRow } from '@/lib/api/activity-logs.service';
import type { MasterDataRecord } from '@/lib/api/master-data.service';

export type MasterDataUploadSummaryStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'failed';

export interface MasterDataUploadSummary {
  fileName: string;
  startedAt: string;
  completedAt?: string;
  status: MasterDataUploadSummaryStatus;
  /** Rows in the uploaded file */
  fileRowCount: number;
  /** New rows added to master */
  addedRows: number;
  duplicateCount: number;
  missingCount: number;
  skippedEmptyRows?: number;
  duplicateFileSaved: boolean;
  duplicateFileId?: string | null;
  importPercent?: number;
  importMessage?: string;
}

const STORAGE_KEY = 'quoreb2b-master-upload-summary';

export const MASTER_DATA_UPLOAD_SUMMARY_EVENT = 'master-data-upload-summary';

function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function persistUploadSummary(summary: MasterDataUploadSummary): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    /* ignore quota */
  }
}

export function readPersistedUploadSummary(): MasterDataUploadSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MasterDataUploadSummary;
  } catch {
    return null;
  }
}

export function emitUploadSummary(summary: MasterDataUploadSummary): void {
  persistUploadSummary(summary);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MasterDataUploadSummary>(MASTER_DATA_UPLOAD_SUMMARY_EVENT, {
      detail: summary,
    }),
  );
}

export function summaryFromImportResult(
  fileName: string,
  result: Record<string, unknown>,
  opts?: { startedAt?: string; completedAt?: string },
): MasterDataUploadSummary {
  const addedRows = safeNum(result.addedRows);
  const duplicateCount = safeNum(result.skippedDuplicates);
  const missingCount = safeNum(result.missingRowCount ?? result.skippedIncomplete);
  const fileRowCount = safeNum(
    result.fileRowCount ?? addedRows + duplicateCount + missingCount + safeNum(result.skippedEmptyRows),
  );
  return {
    fileName,
    startedAt: opts?.startedAt ?? new Date().toISOString(),
    completedAt: opts?.completedAt ?? new Date().toISOString(),
    status: 'done',
    fileRowCount,
    addedRows,
    duplicateCount,
    missingCount,
    skippedEmptyRows: safeNum(result.skippedEmptyRows) || undefined,
    duplicateFileSaved: Boolean(result.duplicateFileSaved),
    duplicateFileId: (result.duplicateFileId as string | null | undefined) ?? null,
  };
}

export function summaryFromActivityLog(log: ActivityLogRow): MasterDataUploadSummary | null {
  const meta = log.metadata;
  if (!meta || log.action !== 'MASTER_DATA_UPLOAD') return null;
  const addedRows = safeNum(meta.addedRows);
  const duplicateCount = safeNum(meta.skippedDuplicates);
  const missingCount = safeNum(meta.missingRowCount ?? meta.skippedIncomplete);
  const fileRowCount = safeNum(meta.fileRowCount ?? addedRows + duplicateCount + missingCount);
  return {
    fileName: String(meta.fileName ?? 'upload'),
    startedAt: log.createdAt,
    completedAt: log.createdAt,
    status: 'done',
    fileRowCount,
    addedRows,
    duplicateCount,
    missingCount,
    skippedEmptyRows: safeNum(meta.skippedEmptyRows) || undefined,
    duplicateFileSaved: Boolean(meta.duplicateFileSaved),
    duplicateFileId: (meta.duplicateFileId as string | null | undefined) ?? null,
  };
}

export function summaryFromSaveRecord(
  fileName: string,
  record: MasterDataRecord,
): MasterDataUploadSummary {
  return summaryFromImportResult(fileName, record as unknown as Record<string, unknown>);
}

export function isUploadSummaryToday(summary: MasterDataUploadSummary | null): boolean {
  if (!summary?.completedAt && !summary?.startedAt) return false;
  const key = (summary.completedAt ?? summary.startedAt).slice(0, 10);
  return key === todayDateKey();
}

export function uploadStatusLabel(summary: MasterDataUploadSummary | null): string {
  if (!summary || summary.status === 'idle') return 'No upload today';
  if (summary.status === 'uploading') return 'Uploading…';
  if (summary.status === 'processing') {
    return summary.importPercent != null
      ? `Processing ${Math.round(summary.importPercent)}%`
      : 'Processing…';
  }
  if (summary.status === 'failed') return 'Upload failed';
  return 'Complete';
}
