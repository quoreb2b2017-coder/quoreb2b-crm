import axios from 'axios';
import apiClient from './client';
import { directUploadClient } from './direct-upload-client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { getApiBaseUrl, getDirectUploadApiBaseUrl } from '@/lib/constants/api-url';

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
  columnValueOrFilters?: Array<{ headers: string[]; values: string[] }>;
  columnDateRangeFilters?: Array<{ header: string; from?: string; to?: string }>;
  mustExistColumns?: string[];
  page?: number;
  limit?: number;
  availabilityFilter?: 'all' | 'remaining' | 'in_campaign';
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
  nextCursor?: number;
  hasMore?: boolean;
  batchedByRow: Record<string, Array<{ id: string; name: string }>>;
}

export interface MasterDataBootstrapResult {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  sourceRowIndices: number[];
  totalRows: number;
  limit: number;
  nextCursor?: number;
  hasMore: boolean;
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
  submittedByName?: string;
  campaignName?: string;
  dbName?: string;
  adminName?: string;
  isDuplicateFile?: boolean;
  reason?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  dbAdminReviewedByEmail?: string;
  dbAdminReviewedAt?: string;
  dbAdminReason?: string;
  forwardedByEmail?: string;
  forwardedAt?: string;
  submittedRowCount?: number;
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

export interface EmployeeUploadTemplate {
  headers: string[];
}

export interface EmployeeUploadImportJobStatus {
  jobId: string;
  phase: string;
  percent: number;
  message: string;
  rowsProcessed?: number;
  totalRows?: number;
  fileName?: string;
  error?: string;
  result?: MasterDataUploadRequestSubmitResult;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

function statusQuery(status?: MasterDataUploadRequestStatus | 'all') {
  return status && status !== 'all' ? `?status=${status}` : '';
}

function readApiStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

const EMPTY_MASTER_BOOTSTRAP: MasterDataBootstrapResult = {
  fileName: '',
  sheetName: '',
  headers: [],
  rows: [],
  sourceRowIndices: [],
  totalRows: 0,
  limit: 100,
  hasMore: false,
};

const EMPTY_MASTER_FILTER_SCHEMA: MasterDataFilterSchemaResponse = {
  totalRows: 0,
  headers: [],
  columns: [],
};

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
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const spreadsheet = ext === 'xlsx' || ext === 'xls';

    if (spreadsheet) {
      try {
        onUploadProgress?.({
          percent: 2,
          phase: 'uploading',
          message: 'Preparing S3 upload…',
        });
        const presign = await masterDataService.presignImportJob(file, mode);
        await masterDataService.uploadFileToS3(presign.uploadUrl, file, onUploadProgress);
        onUploadProgress?.({
          percent: 88,
          phase: 'uploading',
          message: 'S3 upload complete — starting background import…',
        });
        await masterDataService.confirmImportJobS3(presign.jobId, mode);
        onUploadProgress?.({
          percent: 12,
          phase: 'queued',
          message: 'Import queued — processing on server',
        });
        return presign.jobId;
      } catch (presignErr) {
        const reason =
          presignErr instanceof Error ? presignErr.message : 'S3 upload unavailable';
        onUploadProgress?.({
          percent: 5,
          phase: 'uploading',
          message: `S3 direct upload unavailable (${reason}) — using server upload…`,
        });
      }
    }

    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);

    const importBase = getImportApiBaseUrl();

    const { data } = await directUploadClient.post(`${importBase}/master-data/import-jobs`, form, {
      timeout: MASTER_DATA_UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: {
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

  presignImportJob: async (
    file: File,
    mode: MasterDataSaveMode = 'replace',
  ): Promise<{
    jobId: string;
    uploadUrl: string;
    s3Key: string;
    bucket: string;
    expiresIn: number;
  }> => {
    const importBase = getImportApiBaseUrl();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      ext === 'csv'
        ? 'text/csv'
        : ext === 'xls'
          ? 'application/vnd.ms-excel'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const { data } = await directUploadClient.post(
      `${importBase}/master-data/import-jobs/presign`,
      {
        fileName: file.name,
        fileSizeBytes: file.size,
        contentType: file.type || contentType,
        mode,
      },
      {
        timeout: 120_000,
      },
    );
    return unwrap<{
      jobId: string;
      uploadUrl: string;
      s3Key: string;
      bucket: string;
      expiresIn: number;
    }>({ data });
  },

  uploadFileToS3: async (
    uploadUrl: string,
    file: File,
    onUploadProgress?: (progress: MasterDataImportProgress) => void,
  ): Promise<void> => {
    await axios.put(uploadUrl, file, {
      timeout: MASTER_DATA_UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
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
  },

  confirmImportJobS3: async (
    jobId: string,
    mode: MasterDataSaveMode = 'replace',
  ): Promise<void> => {
    const importBase = getImportApiBaseUrl();
    await directUploadClient.post(
      `${importBase}/master-data/import-jobs/${jobId}/confirm-s3`,
      { mode },
      {
        timeout: 120_000,
      },
    );
  },

  getImportJobStatus: async (jobId: string): Promise<MasterDataImportJobStatus> => {
    const importBase = getImportApiBaseUrl();
    const { data } = await directUploadClient.get(`${importBase}/master-data/import-jobs/${jobId}`, {
      timeout: MASTER_IMPORT_POLL_TIMEOUT_MS,
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

  shouldUseServerImport(_file: File): boolean {
    return true;
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
      if (status === 403) {
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
  getPreview: async (limit = 100, cursor?: number): Promise<MasterDataSearchResult> => {
    const { data } = await apiClient.get('/master-data/preview', {
      params: { page: 1, limit, cursor },
      timeout: MASTER_DATA_READ_TIMEOUT_MS,
    });
    const body = unwrap<{
      headers: string[];
      rows: string[][];
      sourceRowIndices: number[];
      totalRows: number;
      page: number;
      limit: number;
      nextCursor?: number;
      hasMore?: boolean;
    }>({ data });
    return {
      headers: body.headers,
      rows: body.rows,
      sourceRowIndices: body.sourceRowIndices,
      totalMatches: body.totalRows,
      totalRows: body.totalRows,
      page: body.page,
      limit: body.limit,
      nextCursor: body.nextCursor,
      hasMore: body.hasMore,
      batchedByRow: {},
    };
  },

  getBootstrap: async (limit = 100): Promise<MasterDataBootstrapResult> => {
    try {
      const { data } = await apiClient.get('/master-data/bootstrap', {
        params: { limit },
        timeout: MASTER_DATA_READ_TIMEOUT_MS,
      });
      return unwrap<MasterDataBootstrapResult>({ data });
    } catch (err: unknown) {
      const status = readApiStatus(err);
      if (status === 404 || status === 403) {
        return { ...EMPTY_MASTER_BOOTSTRAP, limit };
      }
      throw err;
    }
  },

  search: async (params: MasterDataSearchParams): Promise<MasterDataSearchResult> => {
    const { data } = await apiClient.post('/master-data/search', params, {
      timeout: MASTER_DATA_SEARCH_TIMEOUT_MS,
    });
    return unwrap<MasterDataSearchResult>({ data });
  },

  getFilterSchema: async (): Promise<MasterDataFilterSchemaResponse> => {
    try {
      const { data } = await apiClient.get('/master-data/filter-schema', {
        timeout: MASTER_DATA_READ_TIMEOUT_MS,
      });
      return unwrap<MasterDataFilterSchemaResponse>({ data });
    } catch (err: unknown) {
      const status = readApiStatus(err);
      if (status === 404 || status === 403) return EMPTY_MASTER_FILTER_SCHEMA;
      throw err;
    }
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

  getEmployeeUploadTemplate: async (): Promise<EmployeeUploadTemplate> => {
    const { data } = await apiClient.get('/master-data/upload-requests/employee/template', {
      timeout: MASTER_DATA_READ_TIMEOUT_MS,
    });
    return unwrap<EmployeeUploadTemplate>({ data });
  },

  getEmployeeUploadImportJobStatus: async (
    jobId: string,
  ): Promise<EmployeeUploadImportJobStatus> => {
    const importBase = getImportApiBaseUrl();
    const { data } = await directUploadClient.get(
      `${importBase}/master-data/upload-requests/employee/import-jobs/${jobId}`,
      {
        timeout: MASTER_IMPORT_POLL_TIMEOUT_MS,
      },
    );
    return unwrap<EmployeeUploadImportJobStatus>({ data });
  },

  getUploadRequests: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    try {
      const { data } = await apiClient.get(`/master-data/upload-requests${statusQuery(status)}`);
      return unwrap<MasterDataUploadRequest[]>({ data });
    } catch (err: unknown) {
      const statusCode = readApiStatus(err);
      if (statusCode === 404 || statusCode === 403) return [];
      throw err;
    }
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
