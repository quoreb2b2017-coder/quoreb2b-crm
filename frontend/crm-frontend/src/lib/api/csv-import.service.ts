import axios from 'axios';
import type { MasterDataImportProgress, MasterDataSaveMode } from '@/lib/api/master-data.service';
import { getApiBaseUrl, getDirectUploadApiBaseUrl } from '@/lib/constants/api-url';
import { directUploadClient } from '@/lib/api/direct-upload-client';

const CSV_UPLOAD_TIMEOUT_MS = 7_200_000;
const CSV_POLL_TIMEOUT_MS = 300_000;
const CSV_API_TIMEOUT_MS = 120_000;

function isProductionCrmHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'crm.quoreb2b.com' || host.endsWith('.vercel.app');
}

function getCsvImportApiBaseUrl(): string {
  if (isProductionCrmHost()) {
    return getDirectUploadApiBaseUrl();
  }
  return getApiBaseUrl();
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export interface CsvImportJobProgress {
  processed: number;
  success: number;
  failed: number;
  totalEstimate: number;
  remaining: number;
  percent: number;
  message: string;
}

export interface CsvImportJobStatus {
  jobId: string;
  status: string;
  fileName?: string;
  mode?: MasterDataSaveMode;
  progress: CsvImportJobProgress;
  errorMessage?: string;
  errorCsvAvailable?: boolean;
  duplicateRowsHeld?: number;
  incompleteRowsHeld?: number;
  result?: {
    addedRows?: number;
    skippedDuplicates?: number;
    missingRowCount?: number;
    fileRowCount?: number;
    duplicateFileSaved?: boolean;
    duplicateFileId?: string | null;
    rowCount?: number;
  };
}

interface PresignResult {
  jobId: string;
  uploadUrl: string;
  s3Key: string;
  bucket: string;
  expiresIn: number;
}

function mapCsvPhase(status: string): string {
  switch (status) {
    case 'pending_upload':
      return 'uploading';
    case 'queued':
      return 'queued';
    case 'processing':
    case 'paused':
      return 'processing';
    case 'completed':
      return 'done';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'processing';
  }
}

export function mapCsvImportToProgress(status: CsvImportJobStatus): MasterDataImportProgress {
  const progress = status.progress ?? ({} as CsvImportJobProgress);
  const phase = mapCsvPhase(status.status);
  const message =
    status.status === 'paused'
      ? 'Import paused'
      : progress.message || status.errorMessage || 'Processing…';

  return {
    percent: Number.isFinite(progress.percent) ? progress.percent : 0,
    phase,
    message,
    rowsProcessed: progress.processed ?? 0,
    totalRows: progress.totalEstimate > 0 ? progress.totalEstimate : undefined,
  };
}

async function presignUpload(
  file: File,
  mode: MasterDataSaveMode,
): Promise<PresignResult> {
  const base = getCsvImportApiBaseUrl();
  const { data } = await directUploadClient.post(
    `${base}/csv-imports/presign`,
    {
      fileName: file.name,
      fileSizeBytes: file.size,
      contentType: file.type || 'text/csv',
      mode,
    },
    {
      timeout: CSV_API_TIMEOUT_MS,
    },
  );
  return unwrap<PresignResult>({ data });
}

async function uploadFileToS3(
  uploadUrl: string,
  file: File,
  onUploadProgress?: (progress: MasterDataImportProgress) => void,
): Promise<void> {
  await axios.put(uploadUrl, file, {
    timeout: CSV_UPLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: { 'Content-Type': file.type || 'text/csv' },
    onUploadProgress: (event) => {
      if (!onUploadProgress || !event.total) return;
      const uploadPct = Math.min(85, Math.round((event.loaded / event.total) * 85));
      onUploadProgress({
        percent: uploadPct,
        phase: 'uploading',
        message: `Uploading directly to S3… ${uploadPct}%`,
      });
    },
  });
}

async function startImportJob(jobId: string): Promise<string> {
  const base = getCsvImportApiBaseUrl();
  const { data } = await directUploadClient.post(
    `${base}/csv-imports/${jobId}/start`,
    {},
    {
      timeout: CSV_API_TIMEOUT_MS,
    },
  );
  const result = unwrap<{ jobId: string; status: string }>({ data });
  return result.jobId || jobId;
}

async function uploadViaMultipartFallback(
  file: File,
  mode: MasterDataSaveMode,
  onUploadProgress?: (progress: MasterDataImportProgress) => void,
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  const base = getCsvImportApiBaseUrl();

  const { data } = await directUploadClient.post(`${base}/csv-imports/upload`, form, {
    timeout: CSV_UPLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (event) => {
      if (!onUploadProgress || !event.total) return;
      const uploadPct = Math.min(40, Math.round((event.loaded / event.total) * 40));
      onUploadProgress({
        percent: uploadPct,
        phase: 'uploading',
        message: `Uploading to server… ${uploadPct}%`,
      });
    },
  });

  const { jobId } = unwrap<{ jobId: string }>({ data });
  return jobId;
}

export const csvImportService = {
  isCsvFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ext === 'csv';
  },

  /**
   * Enterprise flow: presign → browser PUT to S3 → start (API returns in <1s after S3).
   * Falls back to EC2 multipart if presign/S3 direct upload fails.
   */
  uploadAndQueue: async (
    file: File,
    mode: MasterDataSaveMode = 'replace',
    onUploadProgress?: (progress: MasterDataImportProgress) => void,
  ): Promise<string> => {
    onUploadProgress?.({
      percent: 2,
      phase: 'uploading',
      message: 'Preparing S3 upload…',
    });

    try {
      const presign = await presignUpload(file, mode);
      await uploadFileToS3(presign.uploadUrl, file, onUploadProgress);

      onUploadProgress?.({
        percent: 88,
        phase: 'uploading',
        message: 'S3 upload complete — starting background import…',
      });

      const activeJobId = await startImportJob(presign.jobId);

      onUploadProgress?.({
        percent: 12,
        phase: 'queued',
        message: 'Import queued — processing on server',
      });

      return activeJobId;
    } catch (presignErr) {
      const reason =
        presignErr instanceof Error ? presignErr.message : 'Presigned S3 upload failed';
      onUploadProgress?.({
        percent: 5,
        phase: 'uploading',
        message: `S3 direct upload unavailable (${reason}) — using server upload…`,
      });
      return uploadViaMultipartFallback(file, mode, onUploadProgress);
    }
  },

  getJobStatus: async (jobId: string): Promise<CsvImportJobStatus> => {
    const base = getCsvImportApiBaseUrl();
    const { data } = await directUploadClient.get(`${base}/csv-imports/${jobId}`, {
      timeout: CSV_POLL_TIMEOUT_MS,
    });
    return unwrap<CsvImportJobStatus>({ data });
  },

  controlJob: async (
    jobId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<CsvImportJobStatus> => {
    const base = getCsvImportApiBaseUrl();
    const { data } = await directUploadClient.post(
      `${base}/csv-imports/${jobId}/control`,
      { action },
      {
        timeout: CSV_API_TIMEOUT_MS,
      },
    );
    return unwrap<CsvImportJobStatus>({ data });
  },
};
