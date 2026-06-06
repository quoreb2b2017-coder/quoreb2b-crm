import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EMAIL_QUEUE } from './email.constants';
import { EmailJobData } from './email.types';

/** Outbound email provider removed — jobs are logged only (in-app notifications are separate). */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<EmailJobData>) {
    this.logger.warn(
      `Email queue job ${job.id} skipped (no outbound provider): to=${job.data.to}, subject=${job.data.subject}`,
    );
    return { id: String(job.id), status: 'skipped' };
  }
}
