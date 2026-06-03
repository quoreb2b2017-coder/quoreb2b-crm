import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PROSPECT_CHUNK_SIZE } from './bulk-email-verification.constants';
import { BulkEmailVerificationProcessorService } from './bulk-email-verification-processor.service';
import { BulkEmailVerificationService } from './bulk-email-verification.service';

/** Runs verification in-process when REDIS_ENABLED=false. */
@Injectable()
export class BulkEmailVerificationQueueServiceNoop {
  private readonly logger = new Logger(BulkEmailVerificationQueueServiceNoop.name);
  private readonly runningBatchIds = new Set<string>();

  constructor(
    private processor: BulkEmailVerificationProcessorService,
    @Inject(forwardRef(() => BulkEmailVerificationService))
    private bulkService: BulkEmailVerificationService,
  ) {}

  isBatchRunningInProcess(batchId: string): boolean {
    return this.runningBatchIds.has(batchId);
  }

  async isProcessingBatch(batchId: string): Promise<boolean> {
    return this.runningBatchIds.has(batchId);
  }

  async enqueueBatch(batchId: string, prospectIds: string[]): Promise<number> {
    const jobCount = Math.ceil(prospectIds.length / PROSPECT_CHUNK_SIZE);
    if (this.runningBatchIds.has(batchId)) {
      this.logger.debug(`Batch ${batchId} already running in-process`);
      return jobCount;
    }

    this.logger.log(
      `Redis off — batch ${batchId} queued in background (${prospectIds.length} prospects)`,
    );
    this.runningBatchIds.add(batchId);
    void this.runInProcess(batchId, prospectIds).finally(() => {
      this.runningBatchIds.delete(batchId);
    });
    return jobCount;
  }

  private async runInProcess(batchId: string, prospectIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < prospectIds.length; i += PROSPECT_CHUNK_SIZE) {
        const chunk = prospectIds.slice(i, i + PROSPECT_CHUNK_SIZE);
        await this.processor.processProspectChunk(batchId, chunk);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      this.logger.error(`In-process verification failed for batch ${batchId}: ${message}`);
      await this.bulkService.markBatchFailed(batchId, message);
    }
  }
}
