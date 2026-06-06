import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  BULK_EMAIL_VERIFICATION_QUEUE,
  PROSPECT_CHUNK_SIZE,
} from './bulk-email-verification.constants';
import { BulkEmailVerificationJobData } from './bulk-email-verification.types';

const ADD_BULK_SIZE = 100;

@Injectable()
export class BulkEmailVerificationQueueService {
  private readonly logger = new Logger(BulkEmailVerificationQueueService.name);

  constructor(
    @InjectQueue(BULK_EMAIL_VERIFICATION_QUEUE)
    private readonly queue: Queue<BulkEmailVerificationJobData>,
  ) {}

  async isProcessingBatch(batchId: string): Promise<boolean> {
    const jobs = await this.queue.getJobs(['active', 'waiting', 'delayed'], 0, 60, false);
    return jobs.some((job) => job.data?.batchId === batchId);
  }

  async enqueueBatch(batchId: string, prospectIds: string[]): Promise<number> {
    const chunkSize = Math.max(10, PROSPECT_CHUNK_SIZE);
    const bulkJobs: Array<{
      name: string;
      data: BulkEmailVerificationJobData;
      opts: {
        removeOnComplete: number;
        removeOnFail: number;
        attempts: number;
        backoff: { type: 'exponential'; delay: number };
      };
    }> = [];

    for (let i = 0; i < prospectIds.length; i += chunkSize) {
      bulkJobs.push({
        name: 'verify-chunk',
        data: {
          batchId,
          prospectIds: prospectIds.slice(i, i + chunkSize),
        },
        opts: {
          removeOnComplete: 500,
          removeOnFail: 200,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      });
    }

    for (let i = 0; i < bulkJobs.length; i += ADD_BULK_SIZE) {
      await this.queue.addBulk(bulkJobs.slice(i, i + ADD_BULK_SIZE));
    }

    this.logger.log(
      `Enqueued ${bulkJobs.length} verification job(s) for batch ${batchId} (${prospectIds.length} prospects, chunk=${chunkSize})`,
    );
    return bulkJobs.length;
  }
}
