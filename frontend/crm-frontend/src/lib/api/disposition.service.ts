import apiClient from './client';
import type { QcCampaignChannel } from './qc.service';

export type DispositionKind = 'do_not_call' | 'direct_voicemail';

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

export const dispositionService = {
  async getAllTree(): Promise<DispositionTreeNode[]> {
    const { data } = await apiClient.get<DispositionTreeNode[]>('/disposition/all/tree');
    return data;
  },

  async getAll(params?: {
    kind?: DispositionKind;
    year?: number;
    month?: number;
    employeeId?: string;
    rootBatchId?: string;
  }): Promise<DispositionEntry[]> {
    const { data } = await apiClient.get<DispositionEntry[]>('/disposition/all', { params });
    return data;
  },
};
