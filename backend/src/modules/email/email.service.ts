import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE } from './email.constants';
import { EmailJobData } from './email.types';

export type { EmailJobData };

@Injectable()
export class EmailService {
  constructor(@InjectQueue(EMAIL_QUEUE) private emailQueue: Queue) {}

  async send(data: EmailJobData) {
    return this.emailQueue.add('send', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
