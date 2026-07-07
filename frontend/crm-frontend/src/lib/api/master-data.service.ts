import axios from 'axios';
import apiClient from './client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { getApiBaseUrl, getDirectUploadApiBaseUrl } from '@/lib/constants/api-url';
import { useAuthStore } from '@/store/auth.store';

/** Upload timeout for large XLSX files (up to ~500MB). */
const MASTER_DATA_UPLOAD_TIMEOUT_MS = 7_200_000;
/** Total import deadline including parse + MongoDB save for 10L+ rows. */
const MASTER_DATA_IMPORT_DEADLINE_MS = 10_800_000;
/** Read/search endpoints — fail fast instead of holding 3h connections. */
const MASTER_DATA_READ_TIMEOUT_MS = 60_000;
/** Filtered search over 400K+ rows may need a full chunked scan on first request. */
const MASTER_DATA_SEARCH_TIMEOUT_MS = 180_000;
const MASTER_DATA_WRITE_TIMEOUT_MS = MASTER_DATA_IMPORT_DEADLINE_MS;
/** Per-poll timeout — server may be slow while parsing large files. */
const MASTER_IMPORT_POLL_TIMEOUT_MS = 300_000;
const MASTER_IMPORT_THRESHOLD_BYTES = 512 * 1024;
const MASTER_DATA_ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);

export type MasterDataSaveMode = 'append' | 'replace';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProductionCrmHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'crm.quoreb2b.com' || host.endsWith('.vercel.app');
}

/** Large imports bypass Vercel proxy — straight to EC2 nginx. */
function getImportApiBaseUrl(): string {
  if (isProductionCrmHost()) {
    return getDirectUploadApiBaseUrl();
  }
  return getApiBaseUrl();
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken ?? localStorage.getItem('accessToken');
}

export interface MasterDataImportProgress {
  percent: number;
  phase: string;
  message: string;
  rowsProcessed?: number;
  totalRows?: number;
  partIndex?: number;
  totalParts?: number;
  uploadPartIndex?: number;
  uploadPartTotal?: number;
}

export interface MasterDataImportJobStatus {
  jobId: string;
  phase: string;
  percent: number;
  message: string;
  rowsProcessed?: number;
  totalRows?: number;
  fileName?: string;
  error?: string;
  result?: MasterDataRecord;
  partIndex?: number;
  totalParts?: number;
  uploadPartIndex?: number;
  uploadPartTotal?: number;
}

export interface MasterBatchCoverage {
  summary: {
    totalRows: number;
    batchedRows: number;
    availableRows: number;
    batchesFromMaster: number;
  };
  batchedByRow: Record<string, Array<{ id: string; name: string }>>;
}

export interface MasterDataRecord {
  id: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  uploadedByEmail?: string;
  updatedAt?: string;
  createdAt?: string;
  addedRows?: number;
  skippedDuplicates?: number;
  mode?: MasterDataSaveMode;
  /** DB Admin: rows hidden until filter search */
  filterRequired?: boolean;
  /** Large dataset — full rows omitted; first page may be in `rows` */
  largeDataset?: boolean;
  /** Absolute row indices when `rows` is a large-dataset preview slice */
  previewSourceIndices?: number[];
}

export interface MasterDataColumnFilter {
  header: string;
  value: string;
  match?: 'contains' | 'equals' | 'startsWith';
}

export interface MasterDataSearchParams {
  query?: string;
  columnFilters?: MasterDataColumnFilter[];
  columnValueFilters?: Array<{ header: string; values: string[] }>;
  columnDateRangeFilters?: Array<{ header: string; from?: string; to?: string }>;
  mustExistColumns?: string[];
  page?: number;
  limit?: number;
}

export interface MasterDataFilterSchemaResponse {
  totalRows: number;
  headers: string[];
  columns: MasterDataColumnFilterSchema[];
}

export interface MasterDataColumnFilterSchema {
  header: string;
  kind: 'text' | 'select' | 'status' | 'email' | 'phone';
  options: string[];
  filledCount: number;
}

export interface MasterDataSearchResult {
  headers: string[];
  rows: string[][];
  sourceRowIndices: number[];
  totalMatches: number;
  totalRows: number;
  page: number;
  limit: number;
  batchedByRow: Record<string, Array<{ id: string; name: string }>>;
}

export type MasterDataUploadRequestStatus =
  | 'pending'
  | 'pending_db_admin'
  | 'active'
  | 'pending_admin'
  | 'approved'
  | 'rejected';

export type MasterDataUploadSourceRole = 'db_admin' | 'employee';

export interface MasterDataUploadRequest {
  id: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rowCount: number;
  duplicateCount: number;
  duplicatePreviewRows: string[][];
  missingValueCount: number;
  status: MasterDataUploadRequestStatus;
  sourceRole?: MasterDataUploadSourceRole;
  submittedByEmail?: string;
  reason?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  dbAdminReviewedByEmail?: string;
  dbAdminReviewedAt?: string;
  dbAdminReason?: string;
  forwardedByEmail?: string;
  forwardedAt?: string;
  mergedAddedRows?: number;
  mergedTotalRows?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MasterDataUploadRequestSubmitResult {
  request: MasterDataUploadRequest | null;
  duplicateCount: number;
  duplicatePreviewRows: string[][];
  pendingRows: number;
  missingValueCount: number;
  templateHeaders: string[];
  mergedAddedRows?: number;
  duplicateFileId?: string | null;
  duplicateFileName?: string | null;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

function statusQuery(status?: MasterDataUploadRequestStatus | 'all') {
  return status && status !== 'all' ? `?status=${status}` : '';
}

export const masterDataService = {
  save: async (payload: SpreadsheetData, mode: MasterDataSaveMode = 'append') => {
    const { data } = await apiClient.post(
      '/master-data',
      {
        fileName: payload.fileName,
        sheetName: payload.sheetName,
        headers: payload.headers,
        rows: payload.rows,
        mode,
      },
      { timeout: MASTER_DATA_WRITE_TIMEOUT_MS },
    );
    return unwrap<MasterDataRecord>({ data });
  },

  importFile: async (
    file: File,
    mode: MasterDataSaveMode = 'replace',
    onProgress?: (progress: MasterDataImportProgress) => void,
  ) => {
    const jobId = await masterDataService.uploadImportJob(file, mode, onProgress);
    return masterDataService.waitForImportJob(jobId, onProgress);
  },

  uploadImportJob: async (
    file: File,
    mode: MasterDataSaveMode = 'replace',
    onUploadProgress?: (progress: MasterDataImportProgress) => void,
  ): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);

    const token = getAccessToken();
    const importBase = getImportApiBaseUrl();

    const { data } = await axios.post(`${importBase}/master-data/import-jobs`, form, {
      timeout: MASTER_DATA_UPLOAD_TIMEOUT_MS,
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
          message: `Uploading file… ${uploadPct}%`,
        });
      },
    });

    const { jobId } = unwrap<{ jobId: string }>({ data });
    return jobId;
  },

  getImportJobStatus: async (jobId: string): Promise<MasterDataImportJobStatus> => {
    const token = getAccessToken();
    const importBase = getImportApiBaseUrl();
    const { data } = await axios.get(`${importBase}/master-data/import-jobs/${jobId}`, {
      timeout: MASTER_IMPORT_POLL_TIMEOUT_MS,
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return unwrap<MasterDataImportJobStatus>({ data });
  },

  waitForImportJob: async (
    jobId: string,
    onProgress?: (progress: MasterDataImportProgress) => void,
  ) => {
    const deadline = Date.now() + MASTER_DATA_IMPORT_DEADLINE_MS;
    while (Date.now() < deadline) {
      await sleep(800);
      const status = await masterDataService.getImportJobStatus(jobId);
      onProgress?.({
        percent: status.percent,
        phase: status.phase,
        message: status.message,
        rowsProcessed: status.rowsProcessed,
        totalRows: status.totalRows,
      });
      if (status.phase === 'done' && status.result) return status.result;
      if (status.phase === 'failed') {
        throw new Error(status.error || status.message || 'Import failed');
      }
    }
    throw new Error('Import timed out — try again or use a smaller file.');
  },

  shouldUseServerImport(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return file.size >= MASTER_IMPORT_THRESHOLD_BYTES || ext === 'xlsx' || ext === 'xls';
  },

  validateUploadFile(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'xlsb') {
      throw new Error(
        'Excel Binary (.xlsb) is not supported. In Excel use File → Save As → .xlsx, or export as .csv.',
      );
    }
    if (!MASTER_DATA_ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported file type ".${ext}". Please upload .csv, .xlsx, or .xls only.`,
      );
    }
  },

  getBatchCoverage: async (): Promise<MasterBatchCoverage> => {
    try {
      const { data } = await apiClient.get('/master-data/batch-coverage', {
        timeout: MASTER_DATA_READ_TIMEOUT_MS,
      });
      return unwrap<MasterBatchCoverage>({ data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        return {
          summary: { totalRows: 0, batchedRows: 0, availableRows: 0, batchesFromMaster: 0 },
          batchedByRow: {},
        };
      }
      throw err;
    }
  },

  getCurrent: async (): Promise<MasterDataRecord | null> => {
    try {
      const { data } = await apiClient.get('/master-data/current', {
        timeout: MASTER_DATA_READ_TIMEOUT_MS,
      });
      const payload = unwrap<MasterDataRecord | null>({ data });
      return payload ?? null;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) return null;
      throw err;
    }
  },

  /** Fast chunked preview — first page only (100 rows via loadPageRows on server). */
  getPreview: async (limit = 100): Promise<MasterDataSearchResult> => {
    const { data } = await apiClient.get('/master-data/preview', {
      params: { page: 1, limit },
      timeout: MASTER_DATA_READ_TIMEOUT_MS,
    });
    const body = unwrap<{
      headers: string[];
      rows: string[][];
      sourceRowIndices: number[];
      totalRows: number;
      page: number;
      limit: number;
    }>({ data });
    return {
      headers: body.headers,
      rows: body.rows,
      sourceRowIndices: body.sourceRowIndices,
      totalMatches: body.totalRows,
      totalRows: body.totalRows,
      page: body.page,
      limit: body.limit,
      batchedByRow: {},
    };
  },

  search: async (params: MasterDataSearchParams): Promise<MasterDataSearchResult> => {
    const { data } = await apiClient.post('/master-data/search', params, {
      timeout: MASTER_DATA_SEARCH_TIMEOUT_MS,
    });
    return unwrap<MasterDataSearchResult>({ data });
  },

  getFilterSchema: async (): Promise<MasterDataFilterSchemaResponse> => {
    const { data } = await apiClient.get('/master-data/filter-schema', {
      timeout: MASTER_DATA_READ_TIMEOUT_MS,
    });
    return unwrap<MasterDataFilterSchemaResponse>({ data });
  },

  getColumnOptions: async (
    header: string,
    q?: string,
    limit = 40,
  ): Promise<{ header: string; options: string[] }> => {
    const { data } = await apiClient.get('/master-data/column-options', {
      params: { header, q, limit },
      timeout: MASTER_DATA_READ_TIMEOUT_MS,
    });
    return unwrap<{ header: string; options: string[] }>({ data });
  },

  createUploadRequest: async (
    payload: SpreadsheetData,
  ): Promise<MasterDataUploadRequestSubmitResult> => {
    const { data } = await apiClient.post(
      '/master-data/upload-requests',
      {
        fileName: payload.fileName,
        sheetName: payload.sheetName,
        headers: payload.headers,
        rows: payload.rows,
      },
      { timeout: MASTER_DATA_WRITE_TIMEOUT_MS },
    );
    const result = unwrap<MasterDataUploadRequestSubmitResult>({ data });
    if (typeof window !== 'undefined' && (result.request || result.duplicateFileId)) {
      window.dispatchEvent(new CustomEvent('master-data-updated'));
    }
    return result;
  },

  createEmployeeUploadRequest: async (
    payload: SpreadsheetData,
  ): Promise<MasterDataUploadRequestSubmitResult> => {
    const { data } = await apiClient.post(
      '/master-data/upload-requests/employee',
      {
        fileName: payload.fileName,
        sheetName: payload.sheetName,
        headers: payload.headers,
        rows: payload.rows,
      },
      { timeout: MASTER_DATA_WRITE_TIMEOUT_MS },
    );
    const result = unwrap<MasterDataUploadRequestSubmitResult>({ data });
    if (typeof window !== 'undefined' && (result.request || result.duplicateFileId)) {
      window.dispatchEvent(new CustomEvent('master-data-updated'));
    }
    return result;
  },

  getUploadRequests: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const { data } = await apiClient.get(`/master-data/upload-requests${statusQuery(status)}`);
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  getEmployeeUploadRequestsForDbAdmin: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const { data } = await apiClient.get(
      `/master-data/upload-requests/employee/inbox${statusQuery(status)}`,
    );
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  /** Super Admin + DB Admin employee inbox */
  getEmployeeUploadRequestsInbox: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const { data } = await apiClient.get(
      `/master-data/upload-requests/employee/inbox${statusQuery(status)}`,
    );
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  getMyUploadRequests: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const { data } = await apiClient.get(`/master-data/upload-requests/my${statusQuery(status)}`);
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  getUploadRequest: async (
    requestId: string,
  ): Promise<MasterDataUploadRequest & { rows: string[][]; workRows?: string[][] }> => {
    const { data } = await apiClient.get(`/master-data/upload-requests/${requestId}`);
    return unwrap<MasterDataUploadRequest & { rows: string[][]; workRows?: string[][] }>({ data });
  },

  reviewUploadRequest: async (
    requestId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<MasterDataUploadRequest> => {
    const { data } = await apiClient.post(
      `/master-data/upload-requests/${requestId}/review`,
      { status, reason },
    );
    return unwrap<MasterDataUploadRequest>({ data });
  },

  reviewEmployeeUploadByDbAdmin: async (
    requestId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<MasterDataUploadRequest> => {
    const { data } = await apiClient.post(
      `/master-data/upload-requests/${requestId}/db-review`,
      { status, reason },
    );
    return unwrap<MasterDataUploadRequest>({ data });
  },

  updateEmployeeWorkData: async (
    requestId: string,
    rows: string[][],
  ): Promise<MasterDataUploadRequest & { rows: string[][]; workRows?: string[][] }> => {
    const { data } = await apiClient.post(`/master-data/upload-requests/${requestId}/work`, {
      rows,
    });
    return unwrap<MasterDataUploadRequest & { rows: string[][]; workRows?: string[][] }>({
      data,
    });
  },

  forwardEmployeeRequestToAdmin: async (
    requestId: string,
  ): Promise<MasterDataUploadRequest> => {
    const { data } = await apiClient.post(`/master-data/upload-requests/${requestId}/forward`);
    return unwrap<MasterDataUploadRequest>({ data });
  },

  deleteUploadRequest: async (
    requestId: string,
  ): Promise<{ deleted: boolean; id: string; sourceRole?: string }> => {
    const { data } = await apiClient.delete(`/master-data/upload-requests/${requestId}`);
    const result = unwrap<{ deleted: boolean; id: string; sourceRole?: string }>({ data });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('upload-request-deleted', { detail: { id: requestId } }),
      );
    }
    return result;
  },

  clear: async () => {
    const { data } = await apiClient.delete('/master-data/current');
    const result = unwrap<{
      cleared: boolean;
      deletedBatches?: number;
      deletedUploadRequests?: number;
    }>({ data });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      window.dispatchEvent(new CustomEvent('crm-data-cleared'));
      window.dispatchEvent(new CustomEvent('upload-request-deleted', { detail: { id: 'all' } }));
    }
    return result;
  },

};

export function recordToSpreadsheet(record: MasterDataRecord): SpreadsheetData {
  return {
    fileName: record.fileName,
    sheetName: record.sheetName,
    headers: record.headers ?? [],
    rows: record.rows ?? [],
  };
}
