import apiClient from './client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

/** Master file payloads can be large — production needs a longer timeout than default 30s. */
const MASTER_DATA_TIMEOUT_MS = 600_000;
const MASTER_IMPORT_THRESHOLD_BYTES = 2 * 1024 * 1024;

export type MasterDataSaveMode = 'append' | 'replace';

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
  /** Large dataset — rows omitted; browse via Master File search */
  largeDataset?: boolean;
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
      { timeout: MASTER_DATA_TIMEOUT_MS },
    );
    return unwrap<MasterDataRecord>({ data });
  },

  importFile: async (file: File, mode: MasterDataSaveMode = 'replace') => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    const { data } = await apiClient.post('/master-data/import-file', form, {
      timeout: MASTER_DATA_TIMEOUT_MS,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<MasterDataRecord>({ data });
  },

  shouldUseServerImport(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return file.size >= MASTER_IMPORT_THRESHOLD_BYTES || ext === 'xlsx' || ext === 'xls';
  },

  getBatchCoverage: async (): Promise<MasterBatchCoverage> => {
    try {
      const { data } = await apiClient.get('/master-data/batch-coverage');
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
        timeout: MASTER_DATA_TIMEOUT_MS,
      });
      return unwrap<MasterDataRecord>({ data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) return null;
      throw err;
    }
  },

  search: async (params: MasterDataSearchParams): Promise<MasterDataSearchResult> => {
    const { data } = await apiClient.post('/master-data/search', params, {
      timeout: MASTER_DATA_TIMEOUT_MS,
    });
    return unwrap<MasterDataSearchResult>({ data });
  },

  getFilterSchema: async (): Promise<MasterDataFilterSchemaResponse> => {
    const { data } = await apiClient.get('/master-data/filter-schema', {
      timeout: MASTER_DATA_TIMEOUT_MS,
    });
    return unwrap<MasterDataFilterSchemaResponse>({ data });
  },

  createUploadRequest: async (
    payload: SpreadsheetData,
  ): Promise<MasterDataUploadRequestSubmitResult> => {
    const { data } = await apiClient.post('/master-data/upload-requests', {
      fileName: payload.fileName,
      sheetName: payload.sheetName,
      headers: payload.headers,
      rows: payload.rows,
    });
    const result = unwrap<MasterDataUploadRequestSubmitResult>({ data });
    if (typeof window !== 'undefined' && (result.request || result.duplicateFileId)) {
      window.dispatchEvent(new CustomEvent('master-data-updated'));
    }
    return result;
  },

  createEmployeeUploadRequest: async (
    payload: SpreadsheetData,
  ): Promise<MasterDataUploadRequestSubmitResult> => {
    const { data } = await apiClient.post('/master-data/upload-requests/employee', {
      fileName: payload.fileName,
      sheetName: payload.sheetName,
      headers: payload.headers,
      rows: payload.rows,
    });
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
    headers: record.headers,
    rows: record.rows,
  };
}
