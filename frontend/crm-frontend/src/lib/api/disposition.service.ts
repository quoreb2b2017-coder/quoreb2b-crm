import apiClient from './client';
import type { QcCampaignChannel } from './qc.service';

export type DispositionKind =
  | 'do_not_call'
  | 'direct_voicemail'
  | 'call_after_3_months'
  | 'call_after_6_months';

export interface DispositionEntry {
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
  dispositionKind: DispositionKind;
  dispositionLabel: string;
  statusValue?: string;
  headers: string[];
  rowData: string[];
  changedColumns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DispositionTreeNode {
  key: string;
  label: string;
  kind: 'kind' | 'year' | 'month' | 'campaign' | 'employee';
  count?: number;
  dispositionKind?: DispositionKind;
  channel?: QcCampaignChannel;
  year?: number;
  month?: number;
  children?: DispositionTreeNode[];
  entries?: DispositionEntry[];
}

export interface CallbackReminder {
  id: string;
  employeeId: string;
  employeeName?: string;
  batchId: string;
  rootBatchId?: string;
  campaignName: string;
  rowIndex: number;
  leadKey: string;
  leadLabel?: string;
  hours: 24 | 48;
  description: string;
  remindAt: string;
  status: 'scheduled' | 'due' | 'dismissed' | string;
  createdAt?: string;
  dismissedAt?: string;
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as Record<string, unknown>;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

export const dispositionService = {
  async getAllTree(): Promise<DispositionTreeNode[]> {
    const res = await apiClient.get('/disposition/all/tree');
    const tree = unwrap<DispositionTreeNode[]>(res);
    return Array.isArray(tree) ? tree : [];
  },

  async getAll(params?: {
    kind?: DispositionKind;
    year?: number;
    month?: number;
    employeeId?: string;
    rootBatchId?: string;
  }): Promise<DispositionEntry[]> {
    const res = await apiClient.get('/disposition/all', { params });
    const entries = unwrap<DispositionEntry[]>(res);
    return Array.isArray(entries) ? entries : [];
  },

  async createCallbackReminder(payload: {
    batchId: string;
    rowIndex: number;
    hours: 24 | 48;
    description: string;
    leadLabel?: string;
  }): Promise<CallbackReminder> {
    const res = await apiClient.post('/disposition/callback-reminders', payload);
    return unwrap<CallbackReminder>(res);
  },

  async listDueReminders(): Promise<CallbackReminder[]> {
    const res = await apiClient.get('/disposition/callback-reminders/due');
    const rows = unwrap<CallbackReminder[]>(res);
    return Array.isArray(rows) ? rows : [];
  },

  async listMyReminders(): Promise<CallbackReminder[]> {
    const res = await apiClient.get('/disposition/callback-reminders/mine');
    const rows = unwrap<CallbackReminder[]>(res);
    return Array.isArray(rows) ? rows : [];
  },

  async dismissReminder(id: string): Promise<void> {
    await apiClient.post(`/disposition/callback-reminders/${id}/dismiss`);
  },
};
