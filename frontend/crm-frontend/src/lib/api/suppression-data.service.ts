import apiClient from './client';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

import type { CampaignChannel } from '@/lib/campaign/campaign-channels';

export type { CampaignChannel };

export interface SuppressionCampaignSummary {
  id: string;
  name: string;
  rowCount: number;
  batchMonth?: number;
  batchYear?: number;
  campaignChannel?: string;
}

export interface CreateSuppressionCampaignResult {
  campaign: SuppressionCampaignSummary;
  campaignChannel: string;
  created?: boolean;
}

export interface UploadSuppressionCampaignResult {
  campaignId: string;
  addedRows: number;
  duplicateCount: number;
  duplicatePreviewRows: string[][];
  totalRows: number;
  duplicatesBatchId: string | null;
  duplicatesBatchName: string | null;
  mode?: 'append' | 'replace';
}

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

function dispatchUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('suppression-data-updated'));
}

export interface CheckSuppressionResult {
  duplicateCount: number;
  fileDuplicateCount: number;
  manualDuplicateCount: number;
  matchedManualValues: string[];
  duplicatePreviewRows: string[][];
  duplicateFileId: string | null;
  duplicateFileName: string | null;
  duplicateSourceRole: 'employee' | 'db_admin';
  duplicateSourceIndices: number[];
}

export const suppressionDataService = {
  listCampaigns: async () => {
    try {
      const { data } = await apiClient.get('/suppression-data/campaigns');
      return unwrap<SuppressionCampaignSummary[]>({ data });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) {
        const { data } = await apiClient.get('/batches/suppression-campaigns');
        return unwrap<SuppressionCampaignSummary[]>({ data });
      }
      throw err;
    }
  },

  createCampaign: async (payload: {
    name?: string;
    description?: string;
    campaignChannel?: CampaignChannel | string;
  }): Promise<CreateSuppressionCampaignResult> => {
    const { data } = await apiClient.post('/suppression-data/campaigns', payload);
    const result = unwrap<CreateSuppressionCampaignResult>({ data });
    dispatchUpdated();
    return result;
  },

  uploadToCampaign: async (
    campaignId: string,
    payload: SpreadsheetData,
    mode: 'append' | 'replace' = 'append',
  ): Promise<UploadSuppressionCampaignResult> => {
    const { data } = await apiClient.post(`/suppression-data/campaigns/${campaignId}/upload`, {
      fileName: payload.fileName,
      sheetName: payload.sheetName,
      headers: payload.headers,
      rows: payload.rows,
      mode,
    });
    const result = unwrap<UploadSuppressionCampaignResult>({ data });
    dispatchUpdated();
    return result;
  },

  checkSuppression: async (payload: {
    suppressionCampaignId: string;
    checkMode: 'domain' | 'email';
    sourceRequestId?: string;
    sourceBatchId?: string;
    sourceHeaders?: string[];
    sourceRows?: string[][];
    masterSourceRowIndices?: number[];
    masterSearchFilter?: Record<string, unknown>;
    manualInput?: string;
    baseFileName?: string;
  }): Promise<CheckSuppressionResult> => {
    const { data } = await apiClient.post('/suppression-data/check', payload);
    const result = unwrap<CheckSuppressionResult>({ data });
    if (result.duplicateFileId) {
      dispatchUpdated();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('master-data-updated'));
      }
    }
    return result;
  },
};
