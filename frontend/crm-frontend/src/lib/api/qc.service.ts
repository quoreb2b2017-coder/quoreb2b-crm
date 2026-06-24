import apiClient from './client';

export type QcCampaignChannel = 'voip' | 'gps' | 'email' | 'other';

export interface QcEntry {
  id: string;
  employeeId: string;
  employeeName?: string;
  batchId: string;
  rootBatchId?: string;
  campaignName: string;
  campaignChannel: QcCampaignChannel;
  channelLabel: string;
  batchMonth?: number;
  batchYear?: number;
  rowIndex: number;
  leadKey: string;
  leadLabel?: string;
  statusValue?: string;
  headers: string[];
  rowData: string[];
  changedColumns: string[];
  state: string;
  qcDecision?: string;
  qcDecisionLabel?: string;
  returnedToEmployee?: boolean;
  mergedReadyBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QcTreeNode {
  key: string;
  label: string;
  kind: 'year' | 'month' | 'channel' | 'campaign' | 'employee' | 'ready';
  count?: number;
  channel?: QcCampaignChannel;
  year?: number;
  month?: number;
  children?: QcTreeNode[];
  entries?: QcEntry[];
}

export interface QcReadyBatch {
  id: string;
  name: string;
  campaignChannel: QcCampaignChannel;
  channelLabel: string;
  batchMonth?: number;
  batchYear?: number;
  rowCount: number;
  createdAt: string;
  createdByName?: string;
}

export interface QcReadyBatchDetail extends QcReadyBatch {
  headers: string[];
  rows: string[][];
  columnCount: number;
}

export interface QcMergeResult {
  readyBatchId: string;
  name: string;
  campaignName: string;
  rowCount: number;
  channel: QcCampaignChannel;
  year: number;
  month: number;
  mergedCount: number;
  isNewFile: boolean;
}

export const QC_CHANNEL_LABELS: Record<QcCampaignChannel, string> = {
  voip: 'VOIP',
  gps: 'GPS',
  email: 'Email',
  other: 'Other',
};

function unwrap<T>(axiosRes: { data: unknown }): T {
  const body = axiosRes.data as Record<string, unknown>;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

export const qcService = {
  async getMyTree(): Promise<QcTreeNode[]> {
    const res = await apiClient.get('/qc/my/tree');
    const tree = unwrap<QcTreeNode[]>(res);
    return Array.isArray(tree) ? tree : [];
  },

  async getMyCount(): Promise<number> {
    const res = await apiClient.get('/qc/my/count');
    const count = unwrap<number>(res);
    return typeof count === 'number' ? count : 0;
  },

  async getAllTree(): Promise<QcTreeNode[]> {
    const res = await apiClient.get('/qc/all/tree');
    const tree = unwrap<QcTreeNode[]>(res);
    return Array.isArray(tree) ? tree : [];
  },

  async getAllCount(): Promise<number> {
    const res = await apiClient.get('/qc/all/count');
    const count = unwrap<number>(res);
    return typeof count === 'number' ? count : 0;
  },

  async merge(payload: {
    entryIds: string[];
    channel: QcCampaignChannel;
    year: number;
    month: number;
    name?: string;
  }): Promise<QcMergeResult> {
    const res = await apiClient.post('/qc/merge', payload);
    return unwrap<QcMergeResult>(res);
  },

  async reject(entryIds: string[]): Promise<{ rejected: number }> {
    const res = await apiClient.post('/qc/reject', { entryIds });
    return unwrap<{ rejected: number }>(res);
  },

  async setDecision(
    entryId: string,
    decision: 'qualified' | 'tbd' | 'disqualified',
  ): Promise<{
    decision: string;
    decisionLabel: string;
    routed: 'ready_qc' | 'employee_my_qc';
    employeeId?: string;
    employeeName?: string;
    merge?: QcMergeResult;
  }> {
    const res = await apiClient.post('/qc/decision', { entryId, decision });
    return unwrap(res);
  },

  async getReadyTree(): Promise<QcTreeNode[]> {
    const res = await apiClient.get('/qc/ready/tree');
    const tree = unwrap<QcTreeNode[]>(res);
    return Array.isArray(tree) ? tree : [];
  },

  async listReady(params?: {
    year?: number;
    month?: number;
    channel?: QcCampaignChannel;
  }): Promise<QcReadyBatch[]> {
    const res = await apiClient.get('/qc/ready', { params });
    const list = unwrap<QcReadyBatch[]>(res);
    return Array.isArray(list) ? list : [];
  },

  async getReadyBatch(batchId: string): Promise<QcReadyBatchDetail> {
    const res = await apiClient.get(`/qc/ready/${batchId}`);
    return unwrap<QcReadyBatchDetail>(res);
  },

  async clearAll(): Promise<{
    cleared: boolean;
    deletedEntries: number;
    deletedReadyBatches: number;
  }> {
    const res = await apiClient.delete('/qc/all');
    return unwrap(res);
  },
};
