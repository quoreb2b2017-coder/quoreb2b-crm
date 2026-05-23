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
      if (status === 404) return null;
      throw err;
    }
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
