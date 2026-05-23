import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  async generateLeadInsights(leadId: string) {
    return {
      leadId,
      score: 0,
      recommendations: [],
      summary: 'AI insights placeholder - integrate your AI provider',
    };
  }

  async chat(prompt: string, context?: Record<string, unknown>) {
    return {
      response: 'AI chat placeholder - integrate your AI provider',
      prompt,
      context,
    };
  }
}
