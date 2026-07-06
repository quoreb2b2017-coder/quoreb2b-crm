import { Injectable, Logger } from '@nestjs/common';
import { CsvImportQueueService } from './csv-import-queue.service';

/** Fallback when Redis/BullMQ is disabled — runs orchestrator inline (dev only). */
@Injectable()
export class CsvImportQueueServiceNoop {
  private readonly logger = new Logger(CsvImportQueueServiceNoop.name);

  async enqueueOrchestrator(jobId: string): Promise<string> {
    this.logger.warn(
      `BullMQ disabled — import job ${jobId} must be started manually or enable Redis`,
    );
    return `noop-${jobId}`;
  }

  async enqueueBatch(): Promise<string> {
    return 'noop-batch';
  }

  async pauseOrchestrator(): Promise<void> {
    /* noop */
  }
}

export type CsvImportQueueServiceLike = CsvImportQueueService | CsvImportQueueServiceNoop;
