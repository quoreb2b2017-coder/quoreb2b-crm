import apiClient from './client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

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
}

export type MasterDataUploadRequestStatus = 'pending' | 'approved' | 'rejected';

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
  submittedByEmail?: string;
  reason?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
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
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const masterDataService = {
  save: async (payload: SpreadsheetData, mode: MasterDataSaveMode = 'append') => {
    const { data } = await apiClient.post('/master-data', {
      fileName: payload.fileName,
      sheetName: payload.sheetName,
      headers: payload.headers,
      rows: payload.rows,
      mode,
    });
    return unwrap<MasterDataRecord>({ data });
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
      const { data } = await apiClient.get('/master-data/current');
      return unwrap<MasterDataRecord>({ data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) return null;
      throw err;
    }
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
    return unwrap<MasterDataUploadRequestSubmitResult>({ data });
  },

  getUploadRequests: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const params = status && status !== 'all' ? `?status=${status}` : '';
    const { data } = await apiClient.get(`/master-data/upload-requests${params}`);
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  getMyUploadRequests: async (
    status?: MasterDataUploadRequestStatus | 'all',
  ): Promise<MasterDataUploadRequest[]> => {
    const params = status && status !== 'all' ? `?status=${status}` : '';
    const { data } = await apiClient.get(`/master-data/upload-requests/my${params}`);
    return unwrap<MasterDataUploadRequest[]>({ data });
  },

  getUploadRequest: async (
    requestId: string,
  ): Promise<MasterDataUploadRequest & { rows: string[][] }> => {
    const { data } = await apiClient.get(`/master-data/upload-requests/${requestId}`);
    return unwrap<MasterDataUploadRequest & { rows: string[][] }>({ data });
  },

  reviewUploadRequest: async (
    requestId: string,
    status: MasterDataUploadRequestStatus,
    reason?: string,
  ): Promise<MasterDataUploadRequest> => {
    const { data } = await apiClient.post(
      `/master-data/upload-requests/${requestId}/review`,
      { status, reason },
    );
    return unwrap<MasterDataUploadRequest>({ data });
  },

  deleteUploadRequest: async (
    requestId: string,
  ): Promise<{ deleted: boolean; id: string }> => {
    const { data } = await apiClient.delete(`/master-data/upload-requests/${requestId}`);
    return unwrap<{ deleted: boolean; id: string }>({ data });
  },

  clear: async () => {
    const { data } = await apiClient.delete('/master-data/current');
    const result = unwrap<{ cleared: boolean; deletedBatches?: number }>({ data });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      window.dispatchEvent(new CustomEvent('crm-data-cleared'));
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
