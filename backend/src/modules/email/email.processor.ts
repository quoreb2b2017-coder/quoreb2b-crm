import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SesService } from '../../aws/ses/ses.service';
import { EMAIL_QUEUE } from './email.constants';
import { EmailJobData } from './email.types';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private sesService: SesService) {
    super();
  }

  async process(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id} to ${job.data.to}`);
    await this.sesService.sendEmail(
      job.data.to,
      job.data.subject,
      job.data.html,
      job.data.text,
    );
  }
}
