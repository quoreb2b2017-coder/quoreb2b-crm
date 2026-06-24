import apiClient from './client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

export type DeliveredDataSaveMode = 'append' | 'replace';

export interface DeliveredBatchCoverage {
  summary: {
    totalRows: number;
    batchedRows: number;
    availableRows: number;
    batchesFromMaster: number;
  };
  batchedByRow: Record<string, Array<{ id: string; name: string }>>;
}

export interface DeliveredDataRecord {
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
  mode?: DeliveredDataSaveMode;
}

export interface DeliveredBatchCreateResult {
  batch: {
    id: string;
    name: string;
    rowCount: number;
    batchMonth?: number;
    batchYear?: number;
  } | null;
  duplicateCount: number;
  duplicatePreviewRows: string[][];
  duplicatesBatchId: string | null;
  duplicatesBatchName: string | null;
  uniqueRowCount: number;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const deliveredDataService = {
  save: async (payload: SpreadsheetData, mode: DeliveredDataSaveMode = 'append') => {
    const { data } = await apiClient.post('/delivered-data', {
      fileName: payload.fileName,
      sheetName: payload.sheetName,
      headers: payload.headers,
      rows: payload.rows,
      mode,
    });
    return unwrap<DeliveredDataRecord>({ data });
  },

  getBatchCoverage: async (): Promise<DeliveredBatchCoverage> => {
    try {
      const { data } = await apiClient.get('/delivered-data/batch-coverage');
      return unwrap<DeliveredBatchCoverage>({ data });
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

  getCurrent: async (): Promise<DeliveredDataRecord | null> => {
    try {
      const { data } = await apiClient.get('/delivered-data/current');
      return unwrap<DeliveredDataRecord>({ data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) return null;
      throw err;
    }
  },

  listBatches: async () => {
    const { data } = await apiClient.get('/delivered-data/batches');
    return unwrap<Array<Record<string, unknown>>>({ data });
  },

  createBatch: async (payload: {
    name: string;
    description?: string;
    deliveredSourceRowIndices: number[];
  }): Promise<DeliveredBatchCreateResult> => {
    const { data } = await apiClient.post('/delivered-data/batches', payload);
    const result = unwrap<DeliveredBatchCreateResult>({ data });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('delivered-data-updated'));
      if (result.batch) {
        window.dispatchEvent(
          new CustomEvent('delivered-batch-created', {
            detail: {
              id: result.batch.id,
              batchMonth: result.batch.batchMonth,
              batchYear: result.batch.batchYear,
            },
          }),
        );
      }
    }
    return result;
  },

  clear: async () => {
    const { data } = await apiClient.delete('/delivered-data/current');
    const result = unwrap<{
      cleared: boolean;
      deletedBatches?: number;
    }>({ data });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('delivered-data-updated'));
      window.dispatchEvent(new CustomEvent('delivered-data-cleared'));
    }
    return result;
  },
};

export function recordToSpreadsheet(record: DeliveredDataRecord): SpreadsheetData {
  return {
    fileName: record.fileName,
    sheetName: record.sheetName,
    headers: record.headers,
    rows: record.rows,
  };
}
