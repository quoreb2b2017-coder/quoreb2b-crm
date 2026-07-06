import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isRedisEnabled } from '../../../config/env';
import { CsvImportJobRepository } from '../repositories/csv-import-job.repository';
import { CsvImportQueueService } from './csv-import-queue.service';

/**
 * Re-enqueues in-flight CSV imports after a server crash or deploy so processing
 * resumes from the last MongoDB checkpoint (lastRowNumber / nextChunkIndex).
 */
@Injectable()
export class CsvImportRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(CsvImportRecoveryService.name);

  constructor(
    private readonly jobs: CsvImportJobRepository,
    private readonly queue: CsvImportQueueService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isRedisEnabled() || this.config.get('CSV_IMPORT_ENABLED') === false) {
      return;
    }

    // Allow workers to register before re-queueing.
    setTimeout(() => {
      void this.recoverStuckJobs();
    }, 5000);
  }

  private async recoverStuckJobs(): Promise<void> {
    const awaitingFinalize = await this.jobs.findJobsAwaitingFinalize();
    for (const job of awaitingFinalize) {
      try {
        await this.queue.enqueueFinalize(job.jobId);
        this.logger.log(
          `Finalize re-queued for import ${job.jobId} (${job.completedBatches}/${job.totalBatches} batches)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to finalize import ${job.jobId}: ${msg}`);
      }
    }

    const stuck = await this.jobs.findRecoverableJobs();
    if (!stuck.length) return;

    this.logger.warn(`Recovering ${stuck.length} CSV import job(s) after startup`);

    for (const job of stuck) {
      if (job.pauseRequested || job.status === 'paused') {
        continue;
      }
      try {
        const bullId = await this.queue.enqueueOrchestrator(job.jobId);
        await this.jobs.updateStatus(job.jobId, 'queued', { bullJobId: bullId });
        this.logger.log(
          `Re-queued import ${job.jobId} from row ${job.checkpoint?.lastRowNumber ?? 0}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to recover import ${job.jobId}: ${msg}`);
      }
    }
  }
}
