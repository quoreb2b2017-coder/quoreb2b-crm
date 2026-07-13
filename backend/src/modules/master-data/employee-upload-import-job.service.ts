import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppCacheService } from '../../redis/app-cache.service';
import type { MasterDataUploadRequestSubmitResult } from './master-data-upload.types';

export type EmployeeUploadImportPhase =
  | 'pending_upload'
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'merging'
  | 'saving'
  | 'done'
  | 'failed';

export interface EmployeeUploadImportJobStatus {
  jobId: string;
  phase: EmployeeUploadImportPhase;
  percent: number;
  message: string;
  rowsProcessed?: number;
  totalRows?: number;
  fileName?: string;
  error?: string;
  result?: MasterDataUploadRequestSubmitResult;
  s3Key?: string;
  s3Bucket?: string;
  updatedAt: string;
  partIndex?: number;
  totalParts?: number;
}

const JOB_TTL_SECONDS = 3600;
const PERSIST_THROTTLE_MS = 500;
const CACHE_PREFIX = 'employee:upload:import:';
const jobs = new Map<string, EmployeeUploadImportJobStatus>();
const lastPersistAt = new Map<string, number>();

@Injectable()
export class EmployeeUploadImportJobService {
  constructor(private cache: AppCacheService) {}

  createJob(
    fileName: string,
    patch?: Partial<EmployeeUploadImportJobStatus>,
    jobId?: string,
  ): string {
    const id = jobId ?? randomBytes(12).toString('hex');
    const status: EmployeeUploadImportJobStatus = {
      jobId: id,
      phase: 'queued',
      percent: 0,
      message: 'File saved — queued for processing…',
      fileName,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    jobs.set(id, status);
    void this.persist(id, status);
    return id;
  }

  async getJob(jobId: string): Promise<EmployeeUploadImportJobStatus | null> {
    const mem = jobs.get(jobId);
    if (mem) return mem;
    const raw = await this.cache.get(`${CACHE_PREFIX}${jobId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as EmployeeUploadImportJobStatus;
    } catch {
      return null;
    }
  }

  async updateJob(
    jobId: string,
    patch: Partial<Omit<EmployeeUploadImportJobStatus, 'jobId'>>,
  ): Promise<void> {
    const current = (await this.getJob(jobId)) ?? {
      jobId,
      phase: 'queued' as const,
      percent: 0,
      message: '',
      updatedAt: new Date().toISOString(),
    };
    const next: EmployeeUploadImportJobStatus = {
      ...current,
      ...patch,
      jobId,
      updatedAt: new Date().toISOString(),
    };
    jobs.set(jobId, next);

    const terminal = next.phase === 'done' || next.phase === 'failed';
    const now = Date.now();
    const last = lastPersistAt.get(jobId) ?? 0;
    if (!terminal && now - last < PERSIST_THROTTLE_MS) {
      return;
    }
    lastPersistAt.set(jobId, now);
    await this.persist(jobId, next);

    if (terminal) {
      jobs.delete(jobId);
      lastPersistAt.delete(jobId);
    }
  }

  private async persist(jobId: string, status: EmployeeUploadImportJobStatus): Promise<void> {
    await this.cache.set(`${CACHE_PREFIX}${jobId}`, JSON.stringify(status), JOB_TTL_SECONDS);
  }
}
