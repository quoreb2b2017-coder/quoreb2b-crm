import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Public()
  @Get()
  async check() {
    return this.healthService.getStatus();
  }
}
