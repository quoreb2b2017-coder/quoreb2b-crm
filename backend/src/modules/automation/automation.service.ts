import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AUTOMATION_QUEUE } from './automation.constants';

@Injectable()
export class AutomationService {
  constructor(@InjectQueue(AUTOMATION_QUEUE) private queue: Queue) {}

  async triggerWorkflow(workflowId: string, payload: Record<string, unknown>) {
    return this.queue.add('workflow', { workflowId, payload });
  }
}
