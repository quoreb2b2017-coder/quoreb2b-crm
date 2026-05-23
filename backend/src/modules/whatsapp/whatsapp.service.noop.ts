import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappServiceNoop {
  private readonly logger = new Logger(WhatsappServiceNoop.name);

  async sendMessage(data: { to: string; message: string; templateId?: string }) {
    this.logger.warn(`Redis disabled: WhatsApp not queued (to=${data.to})`);
    return { id: 'noop', status: 'skipped' };
  }
}
