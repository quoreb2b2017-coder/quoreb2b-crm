import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { isRedisEnabled } from '../../config/env';
import { shouldRunHttp, shouldRunWorkers } from '../../common/utils/process-role.util';
import { BulkEmailVerificationController } from './bulk-email-verification.controller';
import { BulkEmailVerificationService } from './bulk-email-verification.service';
import { BulkEmailVerificationProcessorService } from './bulk-email-verification-processor.service';
import { EmailVerificationEngineService } from './email-verification-engine.service';
import { BulkEmailVerificationQueueService } from './bulk-email-verification-queue.service';
import { BulkEmailVerificationQueueServiceNoop } from './bulk-email-verification-queue.service.noop';
import { BulkEmailVerificationWorker } from './bulk-email-verification.worker';
import { BULK_EMAIL_VERIFICATION_QUEUE } from './bulk-email-verification.constants';
import {
  EmailVerificationBatch,
  EmailVerificationBatchSchema,
} from './schemas/email-verification-batch.schema';
import {
  EmailVerificationRecord,
  EmailVerificationRecordSchema,
} from './schemas/email-verification-record.schema';
import {
  EmailVerificationProspect,
  EmailVerificationProspectSchema,
} from './schemas/email-verification-prospect.schema';
import { DomainMxCacheService } from './domain-mx-cache.service';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

const mongooseFeatures = MongooseModule.forFeature([
  { name: EmailVerificationBatch.name, schema: EmailVerificationBatchSchema },
  { name: EmailVerificationRecord.name, schema: EmailVerificationRecordSchema },
  { name: EmailVerificationProspect.name, schema: EmailVerificationProspectSchema },
]);

const coreProviders = [
  BulkEmailVerificationService,
  BulkEmailVerificationProcessorService,
  EmailVerificationEngineService,
  DomainMxCacheService,
];

@Module({})
export class BulkEmailVerificationModule {
  static register(): DynamicModule {
    const controllers = shouldRunHttp() ? [BulkEmailVerificationController] : [];
    if (isRedisEnabled()) {
      const workers = shouldRunWorkers() ? [BulkEmailVerificationWorker] : [];
      return {
        module: BulkEmailVerificationModule,
        imports: [
          mongooseFeatures,
          BullModule.registerQueue({ name: BULK_EMAIL_VERIFICATION_QUEUE }),
          ActivityLogsModule,
          NotificationsModule,
        ],
        controllers,
        providers: [
          ...coreProviders,
          BulkEmailVerificationQueueService,
          ...workers,
        ],
        exports: [BulkEmailVerificationService],
      };
    }

    return {
      module: BulkEmailVerificationModule,
      imports: [mongooseFeatures, ActivityLogsModule, NotificationsModule],
      controllers,
      providers: [
        ...coreProviders,
        {
          provide: BulkEmailVerificationQueueService,
          useClass: BulkEmailVerificationQueueServiceNoop,
        },
      ],
      exports: [BulkEmailVerificationService],
    };
  }
}
