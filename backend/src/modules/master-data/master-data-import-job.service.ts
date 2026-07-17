import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppCacheService } from '../../redis/app-cache.service';
import { RedisService } from '../../redis/redis.service';

export type MasterDataImportPhase =
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'merging'
  | 'deduping'
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
  s3Key?: string;
  mode?: 'append' | 'replace';
  updatedAt: string;
  /** Server processing part (50k rows each). */
  partIndex?: number;
  totalParts?: number;
  /** Client multi-file upload part. */
  uploadPartIndex?: number;
  uploadPartTotal?: number;
}

const JOB_TTL_SECONDS = 86_400;
const PERSIST_THROTTLE_MS = 500;
const jobs = new Map<string, MasterDataImportJobStatus>();
const lastPersistAt = new Map<string, number>();

@Injectable()
export class MasterDataImportJobService {
  constructor(
    private cache: AppCacheService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private redisKey(jobId: string): string {
    return `master:job:${jobId}`;
  }

  createJob(
    fileName: string,
    patch?: Partial<Omit<MasterDataImportJobStatus, 'jobId'>>,
  ): string {
    const jobId = randomBytes(12).toString('hex');
    const status: MasterDataImportJobStatus = {
      jobId,
      phase: 'queued',
      percent: 0,
      message: 'File saved — queued for background import…',
      fileName,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    jobs.set(jobId, status);
    void this.persist(jobId, status);
    return jobId;
  }

  async getJob(jobId: string): Promise<MasterDataImportJobStatus | null> {
    const mem = jobs.get(jobId);
    if (mem) return mem;
    const raw =
      (this.redis ? await this.redis.get(this.redisKey(jobId)).catch(() => null) : null) ??
      (await this.cache.get(`master:import:${jobId}`));
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

  private async persist(jobId: string, status: MasterDataImportJobStatus): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(this.redisKey(jobId), JSON.stringify(status), JOB_TTL_SECONDS);
      } catch {
        // AppCache below remains an in-process fallback.
      }
    }
    await this.cache.set(`master:import:${jobId}`, JSON.stringify(status), JOB_TTL_SECONDS);
  }
}
