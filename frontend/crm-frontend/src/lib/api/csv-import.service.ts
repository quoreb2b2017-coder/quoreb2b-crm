import axios from 'axios';
import type { MasterDataImportProgress, MasterDataSaveMode } from '@/lib/api/master-data.service';
import { getApiBaseUrl, getDirectUploadApiBaseUrl } from '@/lib/constants/api-url';
import { useAuthStore } from '@/store/auth.store';

const CSV_UPLOAD_TIMEOUT_MS = 7_200_000;
const CSV_POLL_TIMEOUT_MS = 300_000;

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

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken ?? localStorage.getItem('accessToken');
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
      ? 'Import paused — resume from admin tools or refresh'
      : progress.message || status.errorMessage || 'Processing…';

  return {
    percent: Number.isFinite(progress.percent) ? progress.percent : 0,
    phase,
    message,
    rowsProcessed: progress.processed ?? 0,
    totalRows: progress.totalEstimate > 0 ? progress.totalEstimate : undefined,
  };
}

export const csvImportService = {
  isCsvFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ext === 'csv';
  },

  uploadAndQueue: async (
    file: File,
    mode: MasterDataSaveMode = 'replace',
    onUploadProgress?: (progress: MasterDataImportProgress) => void,
  ): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);

    const token = getAccessToken();
    const base = getCsvImportApiBaseUrl();

    const { data } = await axios.post(`${base}/csv-imports/upload`, form, {
      timeout: CSV_UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      withCredentials: true,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (event) => {
        if (!onUploadProgress || !event.total) return;
        const uploadPct = Math.min(30, Math.round((event.loaded / event.total) * 30));
        onUploadProgress({
          percent: uploadPct,
          phase: 'uploading',
          message: `Uploading to S3… ${uploadPct}%`,
        });
      },
    });

    const { jobId } = unwrap<{ jobId: string }>({ data });
    return jobId;
  },

  getJobStatus: async (jobId: string): Promise<CsvImportJobStatus> => {
    const token = getAccessToken();
    const base = getCsvImportApiBaseUrl();
    const { data } = await axios.get(`${base}/csv-imports/${jobId}`, {
      timeout: CSV_POLL_TIMEOUT_MS,
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return unwrap<CsvImportJobStatus>({ data });
  },

  controlJob: async (
    jobId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<CsvImportJobStatus> => {
    const token = getAccessToken();
    const base = getCsvImportApiBaseUrl();
    const { data } = await axios.post(
      `${base}/csv-imports/${jobId}/control`,
      { action },
      {
        timeout: 60_000,
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    return unwrap<CsvImportJobStatus>({ data });
  },
};
