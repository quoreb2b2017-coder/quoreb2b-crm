import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AutomationServiceNoop {
  private readonly logger = new Logger(AutomationServiceNoop.name);

  async triggerWorkflow(workflowId: string, payload: Record<string, unknown>) {
    this.logger.warn(`Redis disabled: automation not queued (workflow=${workflowId})`);
    return { id: 'noop', status: 'skipped' };
  }
}
