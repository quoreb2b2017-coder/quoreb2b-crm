import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WHATSAPP_QUEUE } from './whatsapp.constants';

@Injectable()
export class WhatsappService {
  constructor(@InjectQueue(WHATSAPP_QUEUE) private queue: Queue) {}

  async sendMessage(data: { to: string; message: string; templateId?: string }) {
    return this.queue.add('send-message', data);
  }
}
