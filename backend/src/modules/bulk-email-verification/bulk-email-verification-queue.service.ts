import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BULK_EMAIL_VERIFICATION_QUEUE, PROSPECT_CHUNK_SIZE } from './bulk-email-verification.constants';
import { BulkEmailVerificationJobData } from './bulk-email-verification.types';

@Injectable()
export class BulkEmailVerificationQueueService {
  private readonly logger = new Logger(BulkEmailVerificationQueueService.name);

  constructor(
    @InjectQueue(BULK_EMAIL_VERIFICATION_QUEUE)
    private readonly queue: Queue<BulkEmailVerificationJobData>,
  ) {}

  async isProcessingBatch(batchId: string): Promise<boolean> {
    const [active, waiting] = await Promise.all([
      this.queue.getJobs(['active']),
      this.queue.getJobs(['waiting', 'delayed']),
    ]);
    const pending = [...active, ...waiting];
    return pending.some((job) => job.data?.batchId === batchId);
  }

  async enqueueBatch(batchId: string, prospectIds: string[]): Promise<number> {
    let jobs = 0;
    for (let i = 0; i < prospectIds.length; i += PROSPECT_CHUNK_SIZE) {
      const chunk = prospectIds.slice(i, i + PROSPECT_CHUNK_SIZE);
      await this.queue.add(
        'verify-chunk',
        { batchId, prospectIds: chunk },
        {
          removeOnComplete: 500,
          removeOnFail: 200,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      jobs += 1;
    }
    this.logger.log(
      `Enqueued ${jobs} verification job(s) for batch ${batchId} (${prospectIds.length} prospects)`,
    );
    return jobs;
  }
}
