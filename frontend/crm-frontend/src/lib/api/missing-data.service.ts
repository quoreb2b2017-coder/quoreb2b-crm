import apiClient from './client';

export type MissingDataSourceRole =
  | 'employee'
  | 'db_admin'
  | 'master'
  | 'admin'
  | 'super_admin';

export interface MissingDataFile {
  id: string;
  sourceKey: string;
  sourceType: string;
  sourceRequestId?: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  missingFields: string[];
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadedByName?: string;
  sourceRole: MissingDataSourceRole;
  batchMonth: number;
  batchYear: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissingDataTreeNode {
  key: string;
  label: string;
  kind: 'year' | 'month' | 'uploader' | 'file';
  count?: number;
  year?: number;
  month?: number;
  uploadedBy?: string;
  children?: MissingDataTreeNode[];
  file?: Omit<MissingDataFile, 'headers' | 'rows'> & {
    headers?: string[];
    rows?: string[][];
  };
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as Record<string, unknown>;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

/** Rows shown in Missing Data UI — full file via Download. */
export const MISSING_DATA_PREVIEW_LIMIT = 10;

export const missingDataService = {
  async getTree(): Promise<MissingDataTreeNode[]> {
    const res = await apiClient.get('/missing-data/tree');
    const tree = unwrap<MissingDataTreeNode[]>(res);
    return Array.isArray(tree) ? tree : [];
  },

  async getFile(
    id: string,
    opts?: { offset?: number; limit?: number; full?: boolean },
  ): Promise<MissingDataFile> {
    const params: Record<string, string | number> = {};
    if (opts?.full) {
      params.full = 'true';
    } else {
      params.offset = opts?.offset ?? 0;
      params.limit = opts?.limit ?? MISSING_DATA_PREVIEW_LIMIT;
    }
    const res = await apiClient.get(`/missing-data/files/${id}`, { params });
    return unwrap<MissingDataFile>(res);
  },

  async deleteFile(id: string): Promise<{ ok: true; id: string }> {
    const res = await apiClient.delete(`/missing-data/files/${id}`);
    return unwrap(res);
  },

  async backfill(): Promise<{
    uploadFiles: number;
    masterFiles: number;
    totalRows: number;
  }> {
    const res = await apiClient.post('/missing-data/backfill', null, {
      timeout: 10 * 60_000,
    });
    return unwrap(res);
  },
};
