import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CsvImportJobRepository } from './repositories/csv-import-job.repository';
import { CsvImportS3Service } from './services/csv-import-s3.service';
import { CsvImportQueueService } from './services/csv-import-queue.service';
import { CsvImportJob } from './schemas/csv-import-job.schema';
import { CsvImportActor, CsvImportMode, PresignedUploadResult } from './csv-import.types';
import { MASTER_DATA_KEY } from '../master-data/schemas/master-data.schema';
import { isRedisEnabled } from '../../config/env';
import {
  DEFAULT_CSV_IMPORT_BATCH_SIZE,
  MAX_CSV_IMPORT_BATCH_SIZE,
  MIN_CSV_IMPORT_BATCH_SIZE,
} from './csv-import.constants';

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly jobs: CsvImportJobRepository,
    private readonly s3: CsvImportS3Service,
    private readonly queue: CsvImportQueueService,
    private readonly config: ConfigService,
  ) {}

  async initiatePresignedUpload(
    dto: {
      fileName: string;
      fileSizeBytes: number;
      contentType?: string;
      mode: CsvImportMode;
      batchSize?: number;
    },
    actor: CsvImportActor,
  ): Promise<PresignedUploadResult> {
    this.assertEnabled();
    if (!this.s3.isEnabled()) {
      throw new ServiceUnavailableException(
        'S3 presigned upload requires AWS_S3_BUCKET and credentials',
      );
    }

    const ext = dto.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'csv') {
      throw new BadRequestException('Enterprise import pipeline currently supports .csv only');
    }

    const jobId = this.jobs.generateJobId();
    const s3Key = this.s3.buildImportKey(jobId, dto.fileName);
    const batchSize = this.normalizeBatchSize(dto.batchSize);

    await this.jobs.create({
      jobId,
      target: 'master-data',
      masterKey: MASTER_DATA_KEY,
      mode: dto.mode,
      status: 'pending_upload',
      fileName: dto.fileName,
      fileSizeBytes: dto.fileSizeBytes,
      s3Bucket: this.s3.getBucket(),
      s3Key,
      batchSize,
      uploadedBy: new Types.ObjectId(actor.userId),
      uploadedByEmail: actor.email,
    });

    const { uploadUrl, expiresIn } = await this.s3.createPresignedUploadUrl(
      s3Key,
      dto.contentType || 'text/csv',
      dto.fileSizeBytes,
    );

    return {
      jobId,
      uploadUrl,
      s3Key,
      bucket: this.s3.getBucket(),
      expiresIn,
    };
  }

  /**
   * Upload local file to S3 (or disk fallback) and return immediately.
   * Processing is queued via BullMQ.
   */
  async uploadAndQueue(
    localPath: string,
    fileName: string,
    fileSizeBytes: number,
    mode: CsvImportMode,
    actor: CsvImportActor,
    batchSize?: number,
  ): Promise<{ jobId: string }> {
    this.assertEnabled();
    const jobId = this.jobs.generateJobId();
    const normalizedBatch = this.normalizeBatchSize(batchSize);
    let s3Key = '';
    let s3Bucket = '';

    if (this.s3.isEnabled()) {
      s3Key = this.s3.buildImportKey(jobId, fileName);
      s3Bucket = this.s3.getBucket();
      await this.s3.uploadLocalFile(localPath, s3Key, 'text/csv');
    } else {
      s3Key = this.s3.localFallbackPath(jobId, fileName);
      const { copyFileSync } = await import('fs');
      copyFileSync(localPath, s3Key);
    }

    const head = this.s3.isEnabled()
      ? await this.s3.headObject(s3Key)
      : { size: fileSizeBytes, etag: `${fileSizeBytes}-${fileName}` };

    await this.assertNoDuplicate(head.etag, MASTER_DATA_KEY);

    await this.jobs.create({
      jobId,
      target: 'master-data',
      masterKey: MASTER_DATA_KEY,
      mode,
      status: 'queued',
      fileName,
      fileSizeBytes: head.size,
      contentHash: head.etag,
      s3Bucket,
      s3Key,
      batchSize: normalizedBatch,
      uploadedBy: new Types.ObjectId(actor.userId),
      uploadedByEmail: actor.email,
    });

    const bullId = await this.queue.enqueueOrchestrator(jobId);
    await this.jobs.updateStatus(jobId, 'queued', { bullJobId: bullId });

    return { jobId };
  }

  async confirmUploadAndStart(
    jobId: string,
    contentHash?: string,
  ): Promise<{ jobId: string; status: string }> {
    this.assertEnabled();
    const job = await this.jobs.findByJobId(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status !== 'pending_upload') {
      throw new BadRequestException(`Job is not awaiting upload (status: ${job.status})`);
    }

    const head = await this.s3.headObject(job.s3Key);
    const hash = contentHash || head.etag;
    await this.assertNoDuplicate(hash, job.masterKey, jobId);

    const bullId = await this.queue.enqueueOrchestrator(jobId);
    await this.jobs.updateStatus(jobId, 'queued', {
      contentHash: hash,
      fileSizeBytes: head.size,
      bullJobId: bullId,
    });

    return { jobId, status: 'queued' };
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    const job = await this.jobs.findByJobId(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    return this.toStatusResponse(job);
  }

  async controlJob(
    jobId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<Record<string, unknown>> {
    const job = await this.jobs.findByJobId(jobId);
    if (!job) throw new NotFoundException('Import job not found');

    if (action === 'pause') {
      if (!['processing', 'queued'].includes(job.status)) {
        throw new BadRequestException(`Cannot pause job in status ${job.status}`);
      }
      await this.jobs.setFlags(jobId, { pauseRequested: true });
      if (job.status === 'processing') {
        await this.jobs.updateStatus(jobId, 'paused');
      }
    } else if (action === 'resume') {
      if (job.status !== 'paused') {
        throw new BadRequestException('Only paused jobs can be resumed');
      }
      await this.jobs.setFlags(jobId, { pauseRequested: false });
      const bullId = await this.queue.enqueueOrchestrator(jobId);
      await this.jobs.updateStatus(jobId, 'queued', { bullJobId: bullId });
    } else if (action === 'cancel') {
      await this.jobs.setFlags(jobId, { cancelRequested: true });
      await this.jobs.updateStatus(jobId, 'cancelled', {
        errorMessage: 'Cancelled by user',
      });
    }

    return this.getJob(jobId);
  }

  async getErrorCsvPresignedUrl(jobId: string): Promise<{ downloadUrl: string }> {
    const job = await this.jobs.findByJobId(jobId);
    if (!job?.errorCsvS3Key) {
      throw new NotFoundException('No error CSV for this job');
    }
    if (!this.s3.isEnabled()) {
      throw new ServiceUnavailableException('S3 not configured');
    }
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: this.config.get('AWS_REGION') });
    const command = new GetObjectCommand({
      Bucket: job.s3Bucket,
      Key: job.errorCsvS3Key,
    });
    const downloadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    return { downloadUrl };
  }

  private async assertNoDuplicate(
    contentHash: string,
    masterKey: string,
    excludeJobId?: string,
  ): Promise<void> {
    if (!contentHash) return;
    const active = await this.jobs.findActiveByContentHash(contentHash, masterKey);
    if (active && active.jobId !== excludeJobId) {
      throw new ConflictException(
        `An import with the same file is already ${active.status} (job ${active.jobId})`,
      );
    }
    const done = await this.jobs.findCompletedByContentHash(contentHash, masterKey);
    if (done && done.jobId !== excludeJobId) {
      this.logger.warn(
        `Duplicate file hash ${contentHash} — previous job ${done.jobId} completed`,
      );
    }
  }

  private normalizeBatchSize(size?: number): number {
    const value = size ?? this.config.get<number>('CSV_IMPORT_BATCH_SIZE', DEFAULT_CSV_IMPORT_BATCH_SIZE);
    return Math.min(MAX_CSV_IMPORT_BATCH_SIZE, Math.max(MIN_CSV_IMPORT_BATCH_SIZE, value));
  }

  private assertEnabled(): void {
    if (this.config.get('CSV_IMPORT_ENABLED') === false) {
      throw new ServiceUnavailableException('CSV import module is disabled');
    }
    if (!isRedisEnabled()) {
      throw new ServiceUnavailableException(
        'Enterprise CSV import requires Redis + BullMQ (set REDIS_ENABLED=true)',
      );
    }
  }

  private toStatusResponse(job: CsvImportJob): Record<string, unknown> {
    const remaining = Math.max(0, job.progress.totalEstimate - job.progress.processed);
    return {
      jobId: job.jobId,
      status: job.status,
      fileName: job.fileName,
      mode: job.mode,
      target: job.target,
      progress: {
        processed: job.progress.processed,
        success: job.progress.success,
        failed: job.progress.failed,
        totalEstimate: job.progress.totalEstimate,
        remaining,
        percent: job.progress.percent,
        message: job.progress.message,
      },
      checkpoint: job.checkpoint,
      totalBatches: job.totalBatches,
      completedBatches: job.completedBatches,
      errorMessage: job.errorMessage,
      errorCsvAvailable: Boolean(job.errorCsvS3Key),
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: (job as CsvImportJob & { createdAt?: Date }).createdAt,
      updatedAt: (job as CsvImportJob & { updatedAt?: Date }).updatedAt,
    };
  }
}
