import { masterDataService, type MasterDataImportProgress, type MasterDataSaveMode } from '@/lib/api/master-data.service';
import {
  csvImportService,
  mapCsvImportToProgress,
} from '@/lib/api/csv-import.service';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { toast } from '@/stores/toast.store';
import { notifyMasterImportComplete } from '@/lib/master-data/master-data-import-notify';
import {
  summaryFromImportResult,
  type MasterDataUploadSummary,
} from '@/lib/master-data/master-data-upload-summary';

const STORAGE_KEY = 'quoreb2b-master-import-job';

function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

type ImportPipeline = 'csv-import' | 'legacy';

interface PersistedImportJob {
  jobId: string;
  fileName: string;
  mode: MasterDataSaveMode;
  startedAt: string;
  pipeline?: ImportPipeline;
  progress?: MasterDataImportProgress;
  uploadPartIndex?: number;
  uploadPartTotal?: number;
}

let pollingJobId: string | null = null;

/** True while a background master-data import may still be running on the server. */
export function isMasterDataImportInProgress(): boolean {
  const store = useMasterDataImportStore.getState();
  if (store.uiPhase === 'active') {
    const phase = store.progress?.phase;
    if (!phase || (phase !== 'done' && phase !== 'failed')) {
      return true;
    }
  }
  return Boolean(readPersistedJob()?.jobId);
}

function persistJob(job: PersistedImportJob) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
}

function readPersistedJob(): PersistedImportJob | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedImportJob;
  } catch {
    return null;
  }
}

function clearPersistedJob() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

function patchPersistedProgress(progress: MasterDataImportProgress) {
  const saved = readPersistedJob();
  if (!saved) return;
  persistJob({ ...saved, progress });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyProgress(progress: MasterDataImportProgress) {
  useMasterDataImportStore.getState().setProgress(progress);
  patchPersistedProgress(progress);
}

function mapJobStatusToProgress(status: Awaited<ReturnType<typeof masterDataService.getImportJobStatus>>): MasterDataImportProgress {
  return {
    percent: status.percent,
    phase: status.phase,
    message: status.message,
    rowsProcessed: status.rowsProcessed,
    totalRows: status.totalRows,
    partIndex: status.partIndex,
    totalParts: status.totalParts,
    uploadPartIndex: status.uploadPartIndex,
    uploadPartTotal: status.uploadPartTotal,
  };
}

/** Restore banner/chip UI immediately after navigation or refresh. */
export function hydrateMasterImportFromStorage(): void {
  const saved = readPersistedJob();
  if (!saved?.jobId) return;

  const store = useMasterDataImportStore.getState();
  if (store.uiPhase === 'active' && store.jobId === saved.jobId && store.progress) {
    return;
  }

  store.begin(saved.fileName, saved.mode);
  store.setJobId(saved.jobId);
  if (saved.progress) {
    store.setProgress(saved.progress);
  }
}

async function pollCsvImportUntilDone(
  jobId: string,
  fileName: string,
  mode: MasterDataSaveMode,
  options?: { silentComplete?: boolean },
) {
  if (pollingJobId === jobId) return;
  pollingJobId = jobId;

  const store = useMasterDataImportStore.getState();
  store.setJobId(jobId);
  if (!store.fileName) {
    useMasterDataImportStore.setState({ fileName, mode, uiPhase: 'active' });
  }

  const deadline = Date.now() + 10_800_000;
  let pollMs = 800;
  let lastPercent = -1;

  try {
    while (Date.now() < deadline) {
      await sleep(pollMs);
      const status = await csvImportService.getJobStatus(jobId);
      const mapped = mapCsvImportToProgress(status);
      if (mapped.percent === lastPercent && mapped.phase !== 'done' && mapped.phase !== 'failed') {
        pollMs = Math.min(pollMs + 400, 5000);
      } else {
        pollMs = 800;
        lastPercent = mapped.percent;
      }
      applyProgress(mapped);

      if (status.status === 'completed') {
        if (!options?.silentComplete) {
          clearPersistedJob();
          useMasterDataImportStore.getState().markDone();
          const result = (status as { result?: Record<string, unknown> }).result;
          const rowCount =
            typeof result?.rowCount === 'number'
              ? result.rowCount
              : status.progress?.success ?? status.progress?.processed ?? 0;
          const summary: MasterDataUploadSummary = result
            ? summaryFromImportResult(fileName, result, {
                startedAt: readPersistedJob()?.startedAt,
              })
            : {
                fileName,
                startedAt: readPersistedJob()?.startedAt ?? new Date().toISOString(),
                completedAt: new Date().toISOString(),
                status: 'done',
                fileRowCount: status.progress?.totalEstimate ?? rowCount,
                addedRows: status.progress?.success ?? rowCount,
                duplicateCount: safeNum(status.duplicateRowsHeld),
                missingCount: safeNum(status.incompleteRowsHeld),
                duplicateFileSaved: false,
                duplicateFileId: null,
              };
          useMasterDataImportStore.getState().setUploadSummary(summary);
          notifyMasterImportComplete({
            fileName,
            summary,
            totalRows: rowCount,
          });
          toast.success(
            mode === 'append' ? 'Master data import complete' : 'Master data replaced',
            rowCount > 0
              ? `${rowCount.toLocaleString()} rows in database · search indexed`
              : 'Import finished successfully',
          );
          window.dispatchEvent(new CustomEvent('master-data-updated'));
          window.dispatchEvent(new CustomEvent('upload-request-deleted', { detail: { id: 'refresh' } }));
          setTimeout(() => useMasterDataImportStore.getState().reset(), 8000);
        }
        return;
      }

      if (status.status === 'failed' || status.status === 'cancelled') {
        clearPersistedJob();
        useMasterDataImportStore.getState().markFailed();
        const msg = status.errorMessage || status.progress?.message || 'Import failed';
        const result = (status as { result?: Record<string, unknown> }).result;
        const addedRows = safeNum(
          result?.addedRows ?? status.progress?.success ?? status.checkpoint?.successRows,
        );
        const duplicateCount = safeNum(result?.skippedDuplicates ?? status.duplicateRowsHeld);
        const missingCount = safeNum(result?.missingRowCount ?? status.incompleteRowsHeld);
        const fileRowCount = safeNum(
          result?.fileRowCount ?? status.progress?.totalEstimate ?? addedRows + duplicateCount + missingCount,
        );
        if (addedRows > 0 || duplicateCount > 0 || missingCount > 0 || fileRowCount > 0) {
          const summary: MasterDataUploadSummary = result
            ? {
                ...summaryFromImportResult(fileName, result, {
                  startedAt: readPersistedJob()?.startedAt,
                }),
                status: 'failed',
              }
            : {
                fileName,
                startedAt: readPersistedJob()?.startedAt ?? new Date().toISOString(),
                completedAt: new Date().toISOString(),
                status: 'failed',
                fileRowCount,
                addedRows,
                duplicateCount,
                missingCount,
                duplicateFileSaved: duplicateCount > 0,
                duplicateFileId: null,
              };
          useMasterDataImportStore.getState().setUploadSummary(summary);
        }
        toast.error('Master data import failed', msg);
        setTimeout(() => useMasterDataImportStore.getState().reset(), 8000);
        throw new Error(msg);
      }
    }
    throw new Error('Import timed out — check back later or retry with a smaller file.');
  } catch (err) {
    if (!options?.silentComplete && useMasterDataImportStore.getState().uiPhase !== 'failed') {
      clearPersistedJob();
      useMasterDataImportStore.getState().markFailed();
      const msg = err instanceof Error ? err.message : 'Import failed';
      toast.error('Master data import failed', msg);
      setTimeout(() => useMasterDataImportStore.getState().reset(), 3000);
    }
    throw err;
  } finally {
    if (pollingJobId === jobId) pollingJobId = null;
  }
}

async function pollImportUntilDone(
  jobId: string,
  fileName: string,
  mode: MasterDataSaveMode,
  options?: {
    silentComplete?: boolean;
    uploadPartIndex?: number;
    uploadPartTotal?: number;
    pipeline?: ImportPipeline;
  },
) {
  if (options?.pipeline === 'csv-import') {
    return pollCsvImportUntilDone(jobId, fileName, mode, options);
  }

  if (pollingJobId === jobId) return;
  pollingJobId = jobId;

  const store = useMasterDataImportStore.getState();
  store.setJobId(jobId);
  if (!store.fileName) {
    useMasterDataImportStore.setState({ fileName, mode, uiPhase: 'active' });
  }

  const deadline = Date.now() + 10_800_000;
  let pollMs = 800;
  let lastPercent = -1;

  try {
    while (Date.now() < deadline) {
      await sleep(pollMs);
      const status = await masterDataService.getImportJobStatus(jobId);
      if (status.percent === lastPercent && status.phase !== 'done' && status.phase !== 'failed') {
        pollMs = Math.min(pollMs + 400, 5000);
      } else {
        pollMs = 800;
        lastPercent = status.percent;
      }
      applyProgress({
        ...mapJobStatusToProgress(status),
        uploadPartIndex: options?.uploadPartIndex ?? status.uploadPartIndex,
        uploadPartTotal: options?.uploadPartTotal ?? status.uploadPartTotal,
      });

      if (status.phase === 'done' && status.result) {
        if (!options?.silentComplete) {
          clearPersistedJob();
          useMasterDataImportStore.getState().markDone();
          const result = status.result as unknown as Record<string, unknown>;
          const rowCount =
            typeof result.rowCount === 'number'
              ? result.rowCount
              : status.rowsProcessed;
          const summary = summaryFromImportResult(fileName, result, {
            startedAt: readPersistedJob()?.startedAt,
          });
          useMasterDataImportStore.getState().setUploadSummary(summary);
          notifyMasterImportComplete({
            fileName,
            summary,
            totalRows: safeNum(rowCount),
          });
          const partial =
            Boolean(result.partial) || Boolean(result.hitRowCap);
          toast.success(
            partial
              ? 'Master data saved'
              : mode === 'append'
                ? 'Master data import complete'
                : 'Master data replaced',
            status.message ||
              (rowCount != null
                ? `${Number(rowCount).toLocaleString()} rows in database · search indexed`
                : 'Import finished successfully'),
          );
          window.dispatchEvent(new CustomEvent('master-data-updated'));
          window.dispatchEvent(new CustomEvent('upload-request-deleted', { detail: { id: 'refresh' } }));
          setTimeout(() => useMasterDataImportStore.getState().reset(), 8000);
        }
        return status.result;
      }

      if (status.phase === 'failed') {
        clearPersistedJob();
        useMasterDataImportStore.getState().markFailed();
        const msg = status.error || status.message || 'Import failed';
        toast.error('Master data import failed', msg);
        setTimeout(() => useMasterDataImportStore.getState().reset(), 3000);
        throw new Error(msg);
      }
    }
    throw new Error('Import timed out — check back later or retry with a smaller file.');
  } catch (err) {
    if (!options?.silentComplete && useMasterDataImportStore.getState().uiPhase !== 'failed') {
      clearPersistedJob();
      useMasterDataImportStore.getState().markFailed();
      const msg = err instanceof Error ? err.message : 'Import failed';
      toast.error('Master data import failed', msg);
      setTimeout(() => useMasterDataImportStore.getState().reset(), 3000);
    }
    throw err;
  } finally {
    if (pollingJobId === jobId) pollingJobId = null;
  }
}

export async function enqueueMasterDataImport(
  file: File,
  mode: MasterDataSaveMode = 'replace',
): Promise<void> {
  const store = useMasterDataImportStore.getState();
  const phase = store.progress?.phase;
  if (
    store.uiPhase === 'active' &&
    phase !== 'done' &&
    phase !== 'failed' &&
    phase !== 'uploading'
  ) {
    throw new Error('Another master data import is already running.');
  }

  masterDataService.validateUploadFile(file);
  store.begin(file.name, mode);

  const useEnterpriseCsv = csvImportService.isCsvFile(file);

  try {
    if (!useEnterpriseCsv) {
      applyProgress({
        percent: 2,
        phase: 'uploading',
        message: 'Uploading spreadsheet to S3 — processing continues on the server…',
      });
    } else {
      applyProgress({
        percent: 2,
        phase: 'uploading',
        message: 'Uploading CSV to S3 — processing continues on the server…',
      });
    }

    const jobId = useEnterpriseCsv
      ? await csvImportService.uploadAndQueue(file, mode, (progress) => {
          applyProgress(progress);
        })
      : await masterDataService.uploadImportJob(file, mode, (progress) => {
          applyProgress(progress);
        });

    const pipeline: ImportPipeline = useEnterpriseCsv ? 'csv-import' : 'legacy';

    persistJob({
      jobId,
      fileName: file.name,
      mode,
      pipeline,
      startedAt: new Date().toISOString(),
      progress: useMasterDataImportStore.getState().progress ?? undefined,
    });

    void pollImportUntilDone(jobId, file.name, mode, { pipeline });
  } catch (err) {
    useMasterDataImportStore.getState().markFailed();
    throw err;
  }
}

export async function resumeMasterDataImportIfNeeded(): Promise<void> {
  const saved = readPersistedJob();
  if (!saved?.jobId) return;
  if (pollingJobId === saved.jobId) return;

  hydrateMasterImportFromStorage();

  const pipeline = saved.pipeline ?? 'legacy';

  try {
    if (pipeline === 'csv-import') {
      const status = await csvImportService.getJobStatus(saved.jobId);
      if (status.status === 'completed') {
        clearPersistedJob();
        useMasterDataImportStore.getState().reset();
        window.dispatchEvent(new CustomEvent('master-data-updated'));
        return;
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        clearPersistedJob();
        useMasterDataImportStore.getState().reset();
        return;
      }

      applyProgress(mapCsvImportToProgress(status));
      void pollImportUntilDone(saved.jobId, saved.fileName, saved.mode, {
        pipeline: 'csv-import',
      });
      return;
    }

    const status = await masterDataService.getImportJobStatus(saved.jobId);
    if (status.phase === 'done') {
      clearPersistedJob();
      useMasterDataImportStore.getState().reset();
      if (status.result) {
        window.dispatchEvent(new CustomEvent('master-data-updated'));
      }
      return;
    }
    if (status.phase === 'failed') {
      clearPersistedJob();
      useMasterDataImportStore.getState().reset();
      return;
    }

    applyProgress(mapJobStatusToProgress(status));

    void pollImportUntilDone(saved.jobId, saved.fileName, saved.mode, {
      uploadPartIndex: saved.uploadPartIndex,
      uploadPartTotal: saved.uploadPartTotal,
      pipeline: 'legacy',
    });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 401) {
      clearPersistedJob();
      useMasterDataImportStore.getState().reset();
    }
  }
}
