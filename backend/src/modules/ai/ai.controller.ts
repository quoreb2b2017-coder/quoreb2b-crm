import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller({ path: 'ai', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('leads/:id/insights')
  getLeadInsights(@Param('id') id: string) {
    return this.aiService.generateLeadInsights(id);
  }

  @Post('chat')
  chat(@Body() body: { prompt: string; context?: Record<string, unknown> }) {
    return this.aiService.chat(body.prompt, body.context);
  }
}
