import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppCacheService } from '../../redis/app-cache.service';

export type MasterDataImportPhase =
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'merging'
  | 'saving'
  | 'done'
  | 'failed';

export interface MasterDataImportJobStatus {
  jobId: string;
  phase: MasterDataImportPhase;
  percent: number;
  message: string;
  rowsProcessed?: number;
  totalRows?: number;
  fileName?: string;
  error?: string;
  result?: Record<string, unknown>;
  updatedAt: string;
}

const JOB_TTL_SECONDS = 3600;
const jobs = new Map<string, MasterDataImportJobStatus>();

@Injectable()
export class MasterDataImportJobService {
  constructor(private cache: AppCacheService) {}

  createJob(fileName: string): string {
    const jobId = randomBytes(12).toString('hex');
    const status: MasterDataImportJobStatus = {
      jobId,
      phase: 'queued',
      percent: 0,
      message: 'Upload received — starting import…',
      fileName,
      updatedAt: new Date().toISOString(),
    };
    jobs.set(jobId, status);
    void this.persist(jobId, status);
    return jobId;
  }

  async getJob(jobId: string): Promise<MasterDataImportJobStatus | null> {
    const mem = jobs.get(jobId);
    if (mem) return mem;
    const raw = await this.cache.get(`master:import:${jobId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MasterDataImportJobStatus;
    } catch {
      return null;
    }
  }

  async updateJob(
    jobId: string,
    patch: Partial<Omit<MasterDataImportJobStatus, 'jobId'>>,
  ): Promise<void> {
    const current = (await this.getJob(jobId)) ?? {
      jobId,
      phase: 'queued' as const,
      percent: 0,
      message: '',
      updatedAt: new Date().toISOString(),
    };
    const next: MasterDataImportJobStatus = {
      ...current,
      ...patch,
      jobId,
      updatedAt: new Date().toISOString(),
    };
    jobs.set(jobId, next);
    await this.persist(jobId, next);
  }

  private async persist(jobId: string, status: MasterDataImportJobStatus): Promise<void> {
    await this.cache.set(`master:import:${jobId}`, JSON.stringify(status), JOB_TTL_SECONDS);
  }
}
