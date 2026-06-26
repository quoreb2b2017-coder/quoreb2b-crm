import apiClient from './client';

export interface BatchRecord {
  id: string;
  name: string;
  description?: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  sharedWith: string[];
  status: string;
  sourceFileName?: string;
  createdAt?: string;
  updatedAt?: string;
  batchMonth?: number;
  batchYear?: number;
  monthLabel?: string;
  folderKey?: string;
  sourceBatchId?: string;
  campaignChannel?: 'voip' | 'gps' | 'email' | 'other' | string;
  batchKind?: string;
}

export interface BatchHierarchyUser {
  id: string;
  name: string;
  email: string;
  employeeId?: string;
  role: 'admin' | 'db_admin' | 'employee';
}

export interface BatchHierarchyActivity {
  views: number;
  touches: number;
  updates: number;
  batchCreates: number;
  shares: number;
  lastActivityAt?: string;
}

export interface BatchHierarchyDistributed {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  createdAt: string;
  sharedWithCount: number;
  sourceBatchId?: string;
}

export interface BatchHierarchyMember {
  user: BatchHierarchyUser;
  dataRows: number;
  accessType: 'full_share' | 'distributed_batch' | 'creator';
  distributedBatches: BatchHierarchyDistributed[];
  activity: BatchHierarchyActivity;
  team: BatchHierarchyMember[];
  shareEvents?: BatchHierarchyShareEvent[];
}

export interface BatchHierarchyShareRecipient {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'db_admin' | 'employee';
}

export interface BatchHierarchyShareEvent {
  id: string;
  sharerId: string;
  sharerName: string;
  sharerRole: 'admin' | 'db_admin' | 'employee';
  batchId: string;
  batchName: string;
  rowCount: number;
  recipients: BatchHierarchyShareRecipient[];
  occurredAt: string;
}

export interface BatchShareResult {
  batch: BatchRecord;
  distributed: Array<{
    userId: string;
    userName: string;
    batchId: string;
    batchName: string;
    rowCount: number;
  }>;
  fullShareUserIds: string[];
  alreadySharedUserIds?: string[];
}

export interface BatchHierarchyResponse {
  root: {
    id: string;
    name: string;
    rowCount: number;
    columnCount: number;
    monthLabel?: string;
    batchMonth?: number;
    batchYear?: number;
    createdAt: string;
    createdByName?: string;
  };
  creator?: BatchHierarchyUser;
  tree: BatchHierarchyMember[];
  directEmployees: BatchHierarchyMember[];
  shareEvents: BatchHierarchyShareEvent[];
}

export interface BatchHierarchyAction {
  id: string;
  action: string;
  label: string;
  occurredAt: string;
  batchId?: string;
  batchName?: string;
  leadLabel?: string;
}

export interface BatchMemberPerformance {
  user: { id: string; name: string; email: string; role: string };
  periodDays: number;
  activity: BatchHierarchyActivity;
  productivityScore: number;
  productivityLabel: string;
  leadActivity: {
    summary: {
      totalLeads: number;
      touched: number;
      updated: number;
      touchedOnly: number;
      viewedOnly: number;
      notTouched: number;
      wonLeads: number;
      activeLeads: number;
      totalAssigned: number;
    };
  };
  dailyActivity: Array<{
    date: string;
    views: number;
    touches: number;
    updates: number;
    total: number;
  }>;
  actionTotals: {
    views: number;
    touches: number;
    touchEvents?: number;
    updates: number;
  };
  recentLeads: Array<{
    leadLabel: string;
    batchName: string;
    status: string;
    lastAt: string;
  }>;
}

// Transform interceptor wraps: axios res.data = { success: true, data: <actual> }
function unwrap<T>(axiosRes: { data: unknown }): T {
  const body = axiosRes.data as Record<string, unknown>;
  // { success, data: T }
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

export const batchesService = {
  create: (payload: {
    name: string;
    description?: string;
    headers: string[];
    rows: string[][];
    sourceFileName?: string;
    sourceBatchId?: string;
    masterSourceRowIndices?: number[];
    parentSourceRowIndices?: number[];
  }) => apiClient.post('/batches', payload).then(r => {
    const result = unwrap<BatchRecord>(r);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('master-data-updated'));
    return result;
  }),

  list: () => apiClient.get('/batches').then(r => {
    const result = unwrap<BatchRecord[] | { data: BatchRecord[] }>(r);
    // handle double-wrapped paginated response
    if (result && !Array.isArray(result) && 'data' in (result as object)) {
      return (result as { data: BatchRecord[] }).data;
    }
    return result as BatchRecord[];
  }),

  getOne: (id: string) => apiClient.get(`/batches/${id}`).then(r => unwrap<BatchRecord>(r)),

  getHierarchy: (id: string) =>
    apiClient.get(`/batches/${id}/hierarchy`).then((r) => unwrap<BatchHierarchyResponse>(r)),

  getMemberActions: (batchId: string, userId: string) =>
    apiClient
      .get(`/batches/${batchId}/hierarchy/members/${userId}/actions`)
      .then((r) => unwrap<BatchHierarchyAction[]>(r)),

  getMemberPerformance: (batchId: string, userId: string) =>
    apiClient
      .get(`/batches/${batchId}/hierarchy/members/${userId}/performance`)
      .then((r) => unwrap<BatchMemberPerformance>(r)),

  update: (
    id: string,
    payload: {
      headers?: string[];
      rows?: string[][];
      name?: string;
      campaignChannel?: string;
    },
  ) =>
    apiClient.patch(`/batches/${id}`, payload).then(r => {
      const result = unwrap<BatchRecord>(r);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('master-data-updated'));
      return result;
    }),

  share: (id: string, userIds: string[]) =>
    apiClient.post(`/batches/${id}/share`, { userIds }).then(r => unwrap<BatchShareResult>(r)),

  unshare: (id: string, userId: string) =>
    apiClient.delete(`/batches/${id}/share/${userId}`).then(r => unwrap<BatchRecord>(r)),

  delete: (id: string) =>
    apiClient.delete(`/batches/${id}`).then((r) => {
      const result = unwrap<{
        deleted: boolean;
        deletedBatchCount?: number;
        masterRowsRestored?: number;
        restoredToMaster?: boolean;
        qcEntriesRemoved?: number;
      }>(r);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('master-data-updated'));
      }
      return result;
    }),
};
