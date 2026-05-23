import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller({ path: 'automation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post('trigger')
  trigger(@Body() body: { workflowId: string; payload: Record<string, unknown> }) {
    return this.automationService.triggerWorkflow(body.workflowId, body.payload);
  }
}
