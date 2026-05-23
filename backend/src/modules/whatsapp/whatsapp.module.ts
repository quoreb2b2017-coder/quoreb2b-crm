import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisEnabled } from '../../config/env';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappServiceNoop } from './whatsapp.service.noop';
import { WHATSAPP_QUEUE } from './whatsapp.constants';

@Module({})
export class WhatsappModule {
  static register(): DynamicModule {
    if (isRedisEnabled()) {
      return {
        module: WhatsappModule,
        imports: [BullModule.registerQueue({ name: WHATSAPP_QUEUE })],
        controllers: [WhatsappController],
        providers: [WhatsappService],
        exports: [WhatsappService],
      };
    }

    return {
      module: WhatsappModule,
      controllers: [WhatsappController],
      providers: [{ provide: WhatsappService, useClass: WhatsappServiceNoop }],
      exports: [WhatsappService],
    };
  }
}
