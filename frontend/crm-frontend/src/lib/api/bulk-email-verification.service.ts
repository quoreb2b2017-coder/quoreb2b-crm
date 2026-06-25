import apiClient from './client';

export type EmailVerificationStatus =
  | 'valid'
  | 'likely_valid'
  | 'catch_all'
  | 'risky'
  | 'invalid'
  | 'unknown';

export type BatchStatus = 'uploaded' | 'pending' | 'processing' | 'completed' | 'failed';

export interface ProspectRow {
  firstName: string;
  lastName: string;
  companyName?: string;
  domain: string;
  /** When upload has Email instead of domain — verified first. */
  email?: string;
}

export interface EmailVerificationBatch {
  id: string;
  sourceFileName: string;
  status: BatchStatus;
  totalProspects: number;
  processedProspects: number;
  emailsGenerated: number;
  verifiedCount: number;
  invalidCount: number;
  catchAllCount: number;
  riskyCount: number;
  likelyValidCount?: number;
  unknownCount: number;
  progress: number;
  createdByEmail?: string;
  errorMessage?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  successRate: number;
  message?: string;
}

export interface EmailVerificationRecord {
  id: string;
  batchId: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  domain: string;
  generatedEmail: string;
  patternType?: string;
  verificationStatus: EmailVerificationStatus;
  confidenceScore: number;
  confidenceLabel: string;
  mxValid: boolean;
  smtpResponse?: string;
  correctedEmail?: string;
  recommendedEmail?: string;
  zerobounceStatus?: string;
  zerobounceSubStatus?: string;
  verificationProvider?: string;
  syntaxValid?: boolean;
  domainExists?: boolean;
  isDisposable?: boolean;
  isRoleBased?: boolean;
  isCatchAllDomain?: boolean;
  verificationDate?: string;
  sourceFile: string;
  createdAt?: string;
}

export interface VerificationAnalytics {
  verificationMode?: 'internal' | 'smtp' | 'manual';
  verificationProvider?: string;
  queueBackend?: 'bullmq' | 'in-process';
  disposableDomainsLoaded?: number;
  likelyValidEmails?: number;
  totalRecordsUploaded: number;
  totalBatches: number;
  emailsGenerated: number;
  verifiedEmails: number;
  invalidEmails: number;
  catchAllEmails: number;
  riskyEmails: number;
  unknownEmails: number;
  successRate: number;
  verificationTrends: Array<{ date: string; count: number }>;
  byStatus: Record<string, number>;
}

export interface ListRecordsParams {
  page?: number;
  limit?: number;
  status?: EmailVerificationStatus;
  /** Comma-separated statuses, e.g. valid,likely_valid,catch_all */
  statuses?: string;
  minScore?: number;
  domain?: string;
  validOnly?: boolean;
  /** corrected | best — narrow rows for email-specific exports */
  emailKind?: 'corrected' | 'best';
}

function unwrap<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'data' in (data as object)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export const bulkEmailVerificationService = {
  async createBatch(fileName: string, rows: ProspectRow[]) {
    const res = await apiClient.post('/bulk-email-verification/batches', {
      fileName,
      rows,
    });
    return unwrap<EmailVerificationBatch & { message?: string }>(res.data);
  },

  async startVerification(batchId: string) {
    const res = await apiClient.post(`/bulk-email-verification/batches/${batchId}/verify`);
    return unwrap<EmailVerificationBatch & { message?: string }>(res.data);
  },

  async listBatches() {
    const res = await apiClient.get('/bulk-email-verification/batches');
    return unwrap<EmailVerificationBatch[]>(res.data);
  },

  async getBatch(id: string) {
    const res = await apiClient.get(`/bulk-email-verification/batches/${id}`);
    return unwrap<EmailVerificationBatch>(res.data);
  },

  async retryBatch(id: string) {
    const res = await apiClient.post(`/bulk-email-verification/batches/${id}/retry`);
    return unwrap<EmailVerificationBatch>(res.data);
  },

  async getAnalytics() {
    const res = await apiClient.get('/bulk-email-verification/analytics');
    return unwrap<VerificationAnalytics>(res.data);
  },

  async listRecords(batchId: string, params: ListRecordsParams = {}) {
    const query: Record<string, string | number | boolean> = {};
    if (params.page != null) query.page = params.page;
    if (params.limit != null) query.limit = params.limit;
    if (params.status) query.status = params.status;
    if (params.statuses) query.statuses = params.statuses;
    if (params.domain) query.domain = params.domain;
    if (params.minScore != null) query.minScore = params.minScore;
    if (params.validOnly === true) query.validOnly = true;
    if (params.emailKind) query.emailKind = params.emailKind;

    const res = await apiClient.get(
      `/bulk-email-verification/batches/${batchId}/records`,
      { params: query },
    );
    return unwrap<{
      items: EmailVerificationRecord[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(res.data);
  },

  async listProspects(batchId: string, page = 1, limit = 500) {
    const res = await apiClient.get(
      `/bulk-email-verification/batches/${batchId}/prospects`,
      { params: { page, limit } },
    );
    return unwrap<{
      fileName: string;
      headers: string[];
      items: Array<{
        id: string;
        firstName: string;
        lastName: string;
        companyName: string;
        domain: string;
        processed: boolean;
      }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(res.data);
  },

  async listAllProspects(batchId: string) {
    const rows: string[][] = [];
    let headers = ['First Name', 'Last Name', 'Company Name', 'Company Domain'];
    let fileName = 'upload';
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.listProspects(batchId, page, 500);
      headers = res.headers;
      fileName = res.fileName;
      for (const item of res.items) {
        rows.push([item.firstName, item.lastName, item.companyName, item.domain]);
      }
      totalPages = res.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
    return { fileName, headers, rows };
  },

  async listAllRecords(batchId: string, params: ListRecordsParams = {}) {
    const items: EmailVerificationRecord[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.listRecords(batchId, { ...params, page, limit: 500 });
      items.push(...res.items);
      totalPages = res.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
    return items;
  },

  async exportCsv(batchId: string, params: ListRecordsParams = {}) {
    const query: Record<string, string | number | boolean> = {};
    if (params.status) query.status = params.status;
    if (params.statuses) query.statuses = params.statuses;
    if (params.domain) query.domain = params.domain;
    if (params.minScore != null) query.minScore = params.minScore;
    if (params.validOnly === true) query.validOnly = true;
    if (params.emailKind) query.emailKind = params.emailKind;

    const res = await apiClient.get(
      `/bulk-email-verification/batches/${batchId}/export`,
      { params: query, responseType: 'blob' },
    );
    return res.data as Blob;
  },

  async exportPassedCsv(
    batchId: string,
    options?: { minScore?: number; strict?: boolean; statuses?: string },
  ) {
    const res = await apiClient.get(
      `/bulk-email-verification/batches/${batchId}/export/passed`,
      {
        params: {
          minScore: options?.minScore,
          strict: options?.strict === false ? 'false' : undefined,
          statuses: options?.statuses,
        },
        responseType: 'blob',
      },
    );
    return res.data as Blob;
  },

  async resetBatch(id: string) {
    const res = await apiClient.post(`/bulk-email-verification/batches/${id}/reset`);
    return unwrap<EmailVerificationBatch & { message?: string }>(res.data);
  },

  async deleteBatch(id: string) {
    const res = await apiClient.delete(`/bulk-email-verification/batches/${id}`);
    return unwrap<{ deleted: boolean; id: string }>(res.data);
  },

  async getBatchDiagnostics(batchId: string) {
    const res = await apiClient.get(
      `/bulk-email-verification/batches/${batchId}/diagnostics`,
    );
    return unwrap<BatchDiagnostics>(res.data);
  },

  async getSmtpHealth() {
    const res = await apiClient.get('/bulk-email-verification/smtp-health');
    return unwrap<SmtpHealth>(res.data);
  },
};

export interface BatchDiagnostics {
  batchId: string;
  fastModeEnabled: boolean;
  jobUsedEstimateMode: boolean;
  verifiedCount: number;
  totalRecords: number;
  totalProspects: number;
  byStatus: Record<string, number>;
  topSmtpResponses: Array<{ response: string; count: number }>;
  port25: { reachable: boolean; message: string; host: string };
  hints: string[];
}

export interface SmtpHealth {
  provider?: string;
  engine?: string;
  queueBackend?: string;
  disposableDomainsLoaded?: number;
  smtpFrom: string | null;
  port25: { reachable: boolean; message: string; host: string };
  usesPassword: boolean;
  note: string;
}
