import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { BULK_EMAIL_VERIFICATION_QUEUE } from './bulk-email-verification.constants';
import { BulkEmailVerificationJobData } from './bulk-email-verification.types';
import { BulkEmailVerificationProcessorService } from './bulk-email-verification-processor.service';

@Processor(BULK_EMAIL_VERIFICATION_QUEUE, {
  concurrency: parseInt(process.env.BULK_EMAIL_QUEUE_CONCURRENCY || '8', 10),
})
export class BulkEmailVerificationWorker extends WorkerHost {
  private readonly logger = new Logger(BulkEmailVerificationWorker.name);

  constructor(private processor: BulkEmailVerificationProcessorService) {
    super();
  }

  async process(job: Job<BulkEmailVerificationJobData>) {
    const { batchId, prospectIds } = job.data;
    this.logger.debug(
      `Job ${job.id}: batch ${batchId}, ${prospectIds.length} prospect(s)`,
    );
    await this.processor.processProspectChunk(batchId, prospectIds);
  }
}
