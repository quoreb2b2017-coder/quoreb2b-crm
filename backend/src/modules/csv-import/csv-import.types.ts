import type { CsvImportJobStatus } from './schemas/csv-import-job.schema';

export type CsvImportTarget = 'master-data';

export type CsvImportMode = 'replace' | 'append';

export interface CsvImportOrchestratorJobData {
  jobId: string;
  /** process = stream CSV; transfer = staging→S3; finalize = wait for batches + complete */
  kind?: 'process' | 'transfer' | 'finalize';
  localPath?: string;
}

export interface CsvImportBatchJobData {
  jobId: string;
  batchNumber: number;
  /** Pre-assigned MongoDB chunk indices for this batch. */
  chunkIndices: number[];
  /** Row payloads serialized as JSON strings (kept small per batch). */
  rows: string[][];
  headers: string[];
  masterKey: string;
  isLastBatch: boolean;
}

export interface CsvImportProgressSnapshot {
  processed: number;
  success: number;
  failed: number;
  totalEstimate: number;
  percent: number;
  remaining: number;
  phase: CsvImportJobStatus;
  message: string;
}

export interface CsvImportActor {
  userId: string;
  email: string;
  role?: string;
  uploadSourceRole?: string;
}

export function resolveCsvUploadSourceRole(roles?: string[]): string {
  if (roles?.includes('super_admin')) return 'super_admin';
  if (roles?.includes('admin')) return 'admin';
  if (roles?.includes('db_admin')) return 'db_admin';
  return 'db_admin';
}

export interface PresignedUploadResult {
  jobId: string;
  uploadUrl: string;
  s3Key: string;
  bucket: string;
  expiresIn: number;
}
