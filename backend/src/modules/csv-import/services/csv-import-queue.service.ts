import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CSV_IMPORT_BATCH_QUEUE,
  CSV_IMPORT_QUEUE,
  DEFAULT_CSV_IMPORT_MAX_RETRIES,
} from '../csv-import.constants';
import {
  CsvImportBatchJobData,
  CsvImportOrchestratorJobData,
} from '../csv-import.types';

@Injectable()
export class CsvImportQueueService {
  private readonly logger = new Logger(CsvImportQueueService.name);

  constructor(
    @InjectQueue(CSV_IMPORT_QUEUE)
    private readonly orchestratorQueue: Queue<CsvImportOrchestratorJobData>,
    @InjectQueue(CSV_IMPORT_BATCH_QUEUE)
    private readonly batchQueue: Queue<CsvImportBatchJobData>,
    private readonly config: ConfigService,
  ) {}

  async enqueueOrchestrator(jobId: string): Promise<string> {
    const maxRetries = this.config.get<number>(
      'CSV_IMPORT_MAX_RETRIES',
      DEFAULT_CSV_IMPORT_MAX_RETRIES,
    );
    const job = await this.orchestratorQueue.add(
      'process-import',
      { jobId, kind: 'process' },
      {
        jobId: `csv-orchestrator-${jobId}`,
        attempts: maxRetries,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    return String(job.id);
  }

  /** Transfer EC2 staging file to S3, then chain to process-import. */
  async enqueueTransfer(jobId: string, localPath: string): Promise<string> {
    const maxRetries = this.config.get<number>(
      'CSV_IMPORT_MAX_RETRIES',
      DEFAULT_CSV_IMPORT_MAX_RETRIES,
    );
    const job = await this.orchestratorQueue.add(
      'transfer-to-s3',
      { jobId, kind: 'transfer', localPath },
      {
        jobId: `csv-transfer-${jobId}`,
        attempts: maxRetries,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
    return String(job.id);
  }

  async enqueueBatch(
    data: CsvImportBatchJobData,
    attempt = 1,
  ): Promise<string> {
    const maxRetries = this.config.get<number>(
      'CSV_IMPORT_MAX_RETRIES',
      DEFAULT_CSV_IMPORT_MAX_RETRIES,
    );
    const job = await this.batchQueue.add('write-batch', data, {
      jobId: `csv-batch-${data.jobId}-${data.batchNumber}`,
      attempts: maxRetries,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
    this.logger.debug(
      `Enqueued batch ${data.batchNumber} for job ${data.jobId} (attempt ${attempt})`,
    );
    return String(job.id);
  }

  async pauseOrchestrator(jobId: string): Promise<void> {
    const bullJob = await this.orchestratorQueue.getJob(`csv-orchestrator-${jobId}`);
    if (bullJob) {
      await bullJob.updateProgress({ paused: true });
    }
  }
}
