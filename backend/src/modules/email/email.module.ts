import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisEnabled } from '../../config/env';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { EmailServiceNoop } from './email.service.noop';
import { EmailProcessor } from './email.processor';
import { EMAIL_QUEUE } from './email.constants';

@Module({})
export class EmailModule {
  static register(): DynamicModule {
    if (isRedisEnabled()) {
      return {
        module: EmailModule,
        imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })],
        controllers: [EmailController],
        providers: [EmailService, EmailProcessor],
        exports: [EmailService],
      };
    }

    return {
      module: EmailModule,
      controllers: [EmailController],
      providers: [{ provide: EmailService, useClass: EmailServiceNoop }],
      exports: [EmailService],
    };
  }
}
