import axios from 'axios';
import {
  masterDataService,
  type MasterDataImportProgress,
  type MasterDataUploadRequestSubmitResult,
} from '@/lib/api/master-data.service';
import { getApiBaseUrl, getDirectUploadApiBaseUrl } from '@/lib/constants/api-url';
import { estimatePartsFromFileSize } from '@/lib/master-data/split-upload-parts';
import { useAuthStore } from '@/store/auth.store';
import { useEmployeeUploadImportStore } from '@/store/employee-upload-import.store';
import { toast } from '@/stores/toast.store';

const STORAGE_KEY = 'quoreb2b-employee-upload-job';
const UPLOAD_TIMEOUT_MS = 7_200_000;

interface PersistedEmployeeUploadJob {
  jobId: string;
  fileName: string;
  startedAt: string;
  progress?: MasterDataImportProgress;
}

function isProductionCrmHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'crm.quoreb2b.com' || host.endsWith('.vercel.app');
}

function getUploadApiBaseUrl(): string {
  if (isProductionCrmHost()) {
    return getDirectUploadApiBaseUrl();
  }
  return getApiBaseUrl();
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken ?? localStorage.getItem('accessToken');
}

function persistJob(job: PersistedEmployeeUploadJob) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
}

function readPersistedJob(): PersistedEmployeeUploadJob | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEmployeeUploadJob;
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

function applyProgress(progress: MasterDataImportProgress) {
  useEmployeeUploadImportStore.getState().setProgress(progress);
  const saved = readPersistedJob();
  if (saved) {
    persistJob({ ...saved, progress });
  }
}

function mapJobToProgress(
  status: Awaited<ReturnType<typeof masterDataService.getEmployeeUploadImportJobStatus>>,
): MasterDataImportProgress {
  return {
    percent: status.percent,
    phase: status.phase,
    message: status.message,
    rowsProcessed: status.rowsProcessed,
    totalRows: status.totalRows,
  };
}

function isCsvFile(file: File): boolean {
  return file.name.split('.').pop()?.toLowerCase() === 'csv';
}

async function uploadCsvViaS3(
  file: File,
  onProgress?: (progress: MasterDataImportProgress) => void,
): Promise<string> {
  const base = getUploadApiBaseUrl();
  const token = getAccessToken();
  const { data } = await axios.post(
    `${base}/master-data/upload-requests/employee/presign`,
    {
      fileName: file.name,
      fileSizeBytes: file.size,
      contentType: file.type || 'text/csv',
    },
    {
      timeout: 120_000,
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  const body = (data as { data?: { jobId: string; uploadUrl: string } }).data ?? data;
  const { jobId, uploadUrl } = body as { jobId: string; uploadUrl: string };

  await axios.put(uploadUrl, file, {
    timeout: UPLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: { 'Content-Type': file.type || 'text/csv' },
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      const uploadPct = Math.min(30, Math.round((event.loaded / event.total) * 30));
      onProgress({
        percent: uploadPct,
        phase: 'uploading',
        message: `Uploading directly to S3… ${uploadPct}%`,
      });
    },
  });

  await axios.post(
    `${base}/master-data/upload-requests/employee/import-jobs/${jobId}/confirm`,
    {},
    {
      timeout: 120_000,
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  return jobId;
}

async function uploadViaMultipart(
  file: File,
  onProgress?: (progress: MasterDataImportProgress) => void,
): Promise<string> {
  const estParts = estimatePartsFromFileSize(file);
  if (estParts > 1) {
    onProgress?.({
      percent: 5,
      phase: 'uploading',
      message: `Uploading file — server will process in ~${estParts} batches of 50k rows…`,
      totalParts: estParts,
    });
  }

  const form = new FormData();
  form.append('file', file);
  const base = getUploadApiBaseUrl();
  const token = getAccessToken();

  const { data } = await axios.post(
    `${base}/master-data/upload-requests/employee/import-jobs`,
    form,
    {
      timeout: UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      withCredentials: true,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        const uploadPct = Math.min(30, Math.round((event.loaded / event.total) * 30));
        onProgress({
          percent: uploadPct,
          phase: 'uploading',
          message: `Uploading file… ${uploadPct}%`,
        });
      },
    },
  );

  const body = (data as { data?: { jobId: string } }).data ?? data;
  return (body as { jobId: string }).jobId;
}

async function pollUntilDone(
  jobId: string,
): Promise<MasterDataUploadRequestSubmitResult> {
  const deadline = Date.now() + 10_800_000;
  let pollMs = 800;
  let lastPercent = -1;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const status = await masterDataService.getEmployeeUploadImportJobStatus(jobId);
    const mapped = mapJobToProgress(status);
    if (mapped.percent === lastPercent && status.phase !== 'done' && status.phase !== 'failed') {
      pollMs = Math.min(pollMs + 400, 5000);
    } else {
      pollMs = 800;
      lastPercent = mapped.percent;
    }
    applyProgress(mapped);

    if (status.phase === 'done' && status.result) {
      clearPersistedJob();
      useEmployeeUploadImportStore.getState().markDone();
      return status.result;
    }

    if (status.phase === 'failed') {
      clearPersistedJob();
      useEmployeeUploadImportStore.getState().markFailed();
      throw new Error(status.error || status.message || 'Upload failed');
    }
  }

  throw new Error('Upload timed out — try again or use a smaller file.');
}

export async function enqueueEmployeeUploadImport(
  file: File,
): Promise<MasterDataUploadRequestSubmitResult> {
  const store = useEmployeeUploadImportStore.getState();
  if (
    store.uiPhase === 'active' &&
    store.progress?.phase !== 'done' &&
    store.progress?.phase !== 'failed'
  ) {
    throw new Error('Another upload is already running.');
  }

  masterDataService.validateUploadFile(file);
  store.begin(file.name);

  try {
    let jobId: string;

    if (isCsvFile(file)) {
      try {
        jobId = await uploadCsvViaS3(file, applyProgress);
      } catch {
        jobId = await uploadViaMultipart(file, applyProgress);
      }
    } else {
      jobId = await uploadViaMultipart(file, applyProgress);
    }

    store.setJobId(jobId);
    persistJob({
      jobId,
      fileName: file.name,
      startedAt: new Date().toISOString(),
      progress: useEmployeeUploadImportStore.getState().progress ?? undefined,
    });

    applyProgress({
      percent: Math.max(useEmployeeUploadImportStore.getState().progress?.percent ?? 30, 30),
      phase: 'queued',
      message: 'File received — processing on server…',
    });

    const result = await pollUntilDone(jobId);

    if (result.request) {
      const totalInFile =
        (result.request.submittedRowCount ?? 0) > 0
          ? result.request.submittedRowCount!
          : (result.mergedAddedRows ?? result.pendingRows) + (result.duplicateCount ?? 0);
      const merged = result.mergedAddedRows ?? result.pendingRows;
      toast.success(
        'Merged to master file',
        `${merged.toLocaleString('en-US')} new of ${totalInFile.toLocaleString('en-US')} in your file${result.duplicateCount > 0 ? ` · ${result.duplicateCount.toLocaleString('en-US')} duplicate(s)` : ''}${result.duplicateFileName ? ` · saved as ${result.duplicateFileName}` : ''}`,
      );
    } else if (result.duplicateFileName) {
      toast.info(
        'Duplicates saved',
        `${result.duplicateCount.toLocaleString('en-US')} duplicate contact(s) in ${result.duplicateFileName}`,
      );
    } else {
      toast.info(
        'No new contacts',
        result.duplicateCount > 0
          ? `${result.duplicateCount.toLocaleString('en-US')} duplicate contact(s) were found`
          : 'All contacts were empty or duplicates',
      );
    }

    window.dispatchEvent(new CustomEvent('master-data-updated'));
    setTimeout(() => useEmployeeUploadImportStore.getState().reset(), 8000);
    return result;
  } catch (err) {
    clearPersistedJob();
    useEmployeeUploadImportStore.getState().markFailed();
    setTimeout(() => useEmployeeUploadImportStore.getState().reset(), 3000);
    throw err;
  }
}
