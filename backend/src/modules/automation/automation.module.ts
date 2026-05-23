import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisEnabled } from '../../config/env';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationServiceNoop } from './automation.service.noop';
import { AUTOMATION_QUEUE } from './automation.constants';

@Module({})
export class AutomationModule {
  static register(): DynamicModule {
    if (isRedisEnabled()) {
      return {
        module: AutomationModule,
        imports: [BullModule.registerQueue({ name: AUTOMATION_QUEUE })],
        controllers: [AutomationController],
        providers: [AutomationService],
        exports: [AutomationService],
      };
    }

    return {
      module: AutomationModule,
      controllers: [AutomationController],
      providers: [{ provide: AutomationService, useClass: AutomationServiceNoop }],
      exports: [AutomationService],
    };
  }
}
