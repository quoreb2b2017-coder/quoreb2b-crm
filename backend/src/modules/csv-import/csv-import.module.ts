import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { isRedisEnabled } from '../../config/env';
import { shouldRunHttp, shouldRunWorkers } from '../../common/utils/process-role.util';
import { CsvImportController } from './csv-import.controller';
import { CsvImportService } from './csv-import.service';
import { CsvImportJobRepository } from './repositories/csv-import-job.repository';
import { CsvImportS3Service } from './services/csv-import-s3.service';
import { CsvImportStreamService } from './services/csv-import-stream.service';
import { CsvImportBatchWriterService } from './services/csv-import-batch-writer.service';
import { CsvImportProcessorService } from './services/csv-import-processor.service';
import { CsvImportQueueService } from './services/csv-import-queue.service';
import { CsvImportQueueServiceNoop } from './services/csv-import-queue.service.noop';
import { CsvImportLockService } from './services/csv-import-lock.service';
import { CsvImportLockServiceNoop } from './services/csv-import-lock.service.noop';
import { CsvImportRecoveryService } from './services/csv-import-recovery.service';
import {
  CsvImportOrchestratorWorker,
  CsvImportBatchWorker,
} from './workers/csv-import.worker';
import { CsvImportJob, CsvImportJobSchema } from './schemas/csv-import-job.schema';
import {
  CsvImportFailedRow,
  CsvImportFailedRowSchema,
} from './schemas/csv-import-failed-row.schema';
import {
  CSV_IMPORT_BATCH_QUEUE,
  CSV_IMPORT_QUEUE,
} from './csv-import.constants';
import { MasterDataChunk, MasterDataChunkSchema } from '../master-data/schemas/master-data-chunk.schema';
import {
  MasterDataRecord,
  MasterDataSchema,
} from '../master-data/schemas/master-data.schema';
import {
  MasterDataUploadRequest,
  MasterDataUploadRequestSchema,
} from '../master-data/schemas/master-data-upload-request.schema';
import { RedisModule } from '../../redis/redis.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { MissingDataModule } from '../missing-data/missing-data.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { CsvImportDuplicateHoldService } from './services/csv-import-duplicate-hold.service';

const mongooseFeatures = MongooseModule.forFeature([
  { name: CsvImportJob.name, schema: CsvImportJobSchema },
  { name: CsvImportFailedRow.name, schema: CsvImportFailedRowSchema },
  { name: MasterDataChunk.name, schema: MasterDataChunkSchema },
  { name: MasterDataRecord.name, schema: MasterDataSchema },
  { name: MasterDataUploadRequest.name, schema: MasterDataUploadRequestSchema },
]);

const coreProvidersWithoutLock = [
  CsvImportService,
  CsvImportJobRepository,
  CsvImportS3Service,
  CsvImportStreamService,
  CsvImportBatchWriterService,
  CsvImportProcessorService,
  CsvImportRecoveryService,
  CsvImportDuplicateHoldService,
];

@Module({})
export class CsvImportModule {
  static register(): DynamicModule {
    const controllers = shouldRunHttp() ? [CsvImportController] : [];
    if (isRedisEnabled()) {
      const workers = shouldRunWorkers()
        ? [CsvImportOrchestratorWorker, CsvImportBatchWorker]
        : [];
      return {
        module: CsvImportModule,
        imports: [
          mongooseFeatures,
          RedisModule,
          MasterDataModule,
          MissingDataModule,
          ActivityLogsModule,
          BullModule.registerQueue(
            { name: CSV_IMPORT_QUEUE },
            { name: CSV_IMPORT_BATCH_QUEUE },
          ),
        ],
        controllers,
        providers: [
          ...coreProvidersWithoutLock,
          CsvImportLockService,
          CsvImportQueueService,
          ...workers,
        ],
        exports: [CsvImportService],
      };
    }

    return {
      module: CsvImportModule,
      imports: [mongooseFeatures, MasterDataModule, MissingDataModule, ActivityLogsModule],
      controllers,
      providers: [
        ...coreProvidersWithoutLock,
        { provide: CsvImportLockService, useClass: CsvImportLockServiceNoop },
        { provide: CsvImportQueueService, useClass: CsvImportQueueServiceNoop },
      ],
      exports: [CsvImportService],
    };
  }
}
