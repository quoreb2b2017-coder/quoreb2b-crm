import { Injectable, Logger } from '@nestjs/common';
import { EmailJobData } from './email.types';

/** Used when REDIS_ENABLED=false — skips BullMQ, logs the job instead. */
@Injectable()
export class EmailServiceNoop {
  private readonly logger = new Logger(EmailServiceNoop.name);

  async send(data: EmailJobData) {
    this.logger.warn(
      `Redis disabled: email not queued (to=${data.to}, subject=${data.subject})`,
    );
    return { id: 'noop', status: 'skipped' };
  }
}
