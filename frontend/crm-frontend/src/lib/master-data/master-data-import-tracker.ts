import { masterDataService, type MasterDataSaveMode } from '@/lib/api/master-data.service';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { toast } from '@/stores/toast.store';

const STORAGE_KEY = 'quoreb2b-master-import-job';

interface PersistedImportJob {
  jobId: string;
  fileName: string;
  mode: MasterDataSaveMode;
  startedAt: string;
}

let pollingJobId: string | null = null;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollImportUntilDone(jobId: string, fileName: string, mode: MasterDataSaveMode) {
  if (pollingJobId === jobId) return;
  pollingJobId = jobId;

  const store = useMasterDataImportStore.getState();
  store.setJobId(jobId);
  if (!store.fileName) {
    useMasterDataImportStore.setState({ fileName, mode, uiPhase: 'active' });
  }

  const deadline = Date.now() + 10_800_000;

  try {
    while (Date.now() < deadline) {
      await sleep(800);
      const status = await masterDataService.getImportJobStatus(jobId);
      useMasterDataImportStore.getState().setProgress({
        percent: status.percent,
        phase: status.phase,
        message: status.message,
        rowsProcessed: status.rowsProcessed,
        totalRows: status.totalRows,
      });

      if (status.phase === 'done' && status.result) {
        clearPersistedJob();
        useMasterDataImportStore.getState().markDone();
        toast.success(
          mode === 'append' ? 'Master data import complete' : 'Master data replaced',
          `${status.result.rowCount.toLocaleString()} rows in database`,
        );
        window.dispatchEvent(new CustomEvent('master-data-updated'));
        setTimeout(() => useMasterDataImportStore.getState().reset(), 8000);
        return status.result;
      }

      if (status.phase === 'failed') {
        throw new Error(status.error || status.message || 'Import failed');
      }
    }
    throw new Error('Import timed out — check back later or retry with a smaller file.');
  } catch (err) {
    clearPersistedJob();
    useMasterDataImportStore.getState().markFailed();
    const msg = err instanceof Error ? err.message : 'Import failed';
    toast.error('Master data import failed', msg);
    setTimeout(() => useMasterDataImportStore.getState().reset(), 12000);
    throw err;
  } finally {
    if (pollingJobId === jobId) pollingJobId = null;
  }
}

/**
 * Upload file to server, then continue import in the background (safe across tab/page changes).
 * Resolves once the file is on the server and polling has started.
 */
export async function enqueueMasterDataImport(
  file: File,
  mode: MasterDataSaveMode = 'replace',
): Promise<void> {
  const store = useMasterDataImportStore.getState();
  if (store.uiPhase === 'active' && store.progress?.phase !== 'done') {
    throw new Error('Another master data import is already running.');
  }

  store.begin(file.name, mode);

  const jobId = await masterDataService.uploadImportJob(file, mode, (progress) => {
    useMasterDataImportStore.getState().setProgress(progress);
  });

  persistJob({
    jobId,
    fileName: file.name,
    mode,
    startedAt: new Date().toISOString(),
  });

  void pollImportUntilDone(jobId, file.name, mode);
}

/** Resume polling after refresh, tab change, or re-login. */
export async function resumeMasterDataImportIfNeeded(): Promise<void> {
  const saved = readPersistedJob();
  if (!saved?.jobId) return;
  if (pollingJobId === saved.jobId) return;

  try {
    const status = await masterDataService.getImportJobStatus(saved.jobId);
    if (status.phase === 'done') {
      clearPersistedJob();
      if (status.result) {
        window.dispatchEvent(new CustomEvent('master-data-updated'));
      }
      return;
    }
    if (status.phase === 'failed') {
      clearPersistedJob();
      return;
    }

    useMasterDataImportStore.getState().begin(saved.fileName, saved.mode);
    useMasterDataImportStore.getState().setJobId(saved.jobId);
    useMasterDataImportStore.getState().setProgress({
      percent: status.percent,
      phase: status.phase,
      message: status.message,
      rowsProcessed: status.rowsProcessed,
      totalRows: status.totalRows,
    });

    void pollImportUntilDone(saved.jobId, saved.fileName, saved.mode);
  } catch {
    // Auth may be missing right after logout — keep job in storage for next login.
  }
}
