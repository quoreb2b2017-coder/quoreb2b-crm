import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    if (!this.config.get<boolean>('PROMETHEUS_ENABLED', true)) {
      res.status(404).send('Metrics disabled');
      return;
    }
    res.set('Content-Type', this.metrics.getContentType());
    res.send(await this.metrics.getMetrics());
  }
}
