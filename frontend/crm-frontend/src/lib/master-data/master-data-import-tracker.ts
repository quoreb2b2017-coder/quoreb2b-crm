import { masterDataService, type MasterDataImportProgress, type MasterDataSaveMode } from '@/lib/api/master-data.service';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { toast } from '@/stores/toast.store';
import { estimatePartsFromFileSize } from '@/lib/master-data/split-upload-parts';

const STORAGE_KEY = 'quoreb2b-master-import-job';

interface PersistedImportJob {
  jobId: string;
  fileName: string;
  mode: MasterDataSaveMode;
  startedAt: string;
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

async function pollImportUntilDone(
  jobId: string,
  fileName: string,
  mode: MasterDataSaveMode,
  options?: {
    silentComplete?: boolean;
    uploadPartIndex?: number;
    uploadPartTotal?: number;
  },
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
          const rowCount =
            typeof status.result.rowCount === 'number'
              ? status.result.rowCount
              : status.rowsProcessed;
          toast.success(
            mode === 'append' ? 'Master data import complete' : 'Master data replaced',
            rowCount != null
              ? `${rowCount.toLocaleString()} rows in database`
              : 'Import finished successfully',
          );
          window.dispatchEvent(new CustomEvent('master-data-updated'));
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

  try {
    const estParts = estimatePartsFromFileSize(file);
    if (estParts > 1) {
      applyProgress({
        percent: 5,
        phase: 'uploading',
        message: `Uploading full file — server will save in ~${estParts} batches of 50k rows…`,
        totalParts: estParts,
      });
    }

    const jobId = await masterDataService.uploadImportJob(file, mode, (progress) => {
      applyProgress(progress);
    });

    persistJob({
      jobId,
      fileName: file.name,
      mode,
      startedAt: new Date().toISOString(),
      progress: useMasterDataImportStore.getState().progress ?? undefined,
    });

    void pollImportUntilDone(jobId, file.name, mode);
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

  try {
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
    });
  } catch {
    // Keep persisted job — retry on next focus / route change when auth is ready.
  }
}
