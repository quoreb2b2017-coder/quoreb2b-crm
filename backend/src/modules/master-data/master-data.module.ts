import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import {
  MasterDataRecord,
  MasterDataSchema,
} from './schemas/master-data.schema';
import {
  MasterDataUploadRequest,
  MasterDataUploadRequestSchema,
} from './schemas/master-data-upload-request.schema';
import {
  MasterDataChunk,
  MasterDataChunkSchema,
} from './schemas/master-data-chunk.schema';
import { MasterDataRowStore } from './master-data-row.store';
import { MasterDataImportJobService } from './master-data-import-job.service';
import { EmployeeUploadImportJobService } from './employee-upload-import-job.service';
import { EmployeeUploadS3Service } from './employee-upload-s3.service';
import { MasterDataImportLockService } from './master-data-import-lock.service';
import { MasterDataSearchIndexService } from './master-data-search-index.service';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { BatchesModule } from '../batches/batches.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ActivityLogsModule,
    forwardRef(() => BatchesModule),
    NotificationsModule,
    MongooseModule.forFeature([
      { name: MasterDataRecord.name, schema: MasterDataSchema },
      { name: MasterDataUploadRequest.name, schema: MasterDataUploadRequestSchema },
      { name: MasterDataChunk.name, schema: MasterDataChunkSchema },
    ]),
  ],
  controllers: [MasterDataController],
  providers: [
    MasterDataService,
    MasterDataRowStore,
    MasterDataImportJobService,
    EmployeeUploadImportJobService,
    EmployeeUploadS3Service,
    MasterDataImportLockService,
    MasterDataSearchIndexService,
  ],
  exports: [MasterDataService, MasterDataSearchIndexService, MasterDataRowStore],
})
export class MasterDataModule {}
