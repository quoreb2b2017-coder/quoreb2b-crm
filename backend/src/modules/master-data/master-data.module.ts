import { Module } from '@nestjs/common';
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
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { BatchesModule } from '../batches/batches.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ActivityLogsModule,
    BatchesModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: MasterDataRecord.name, schema: MasterDataSchema },
      { name: MasterDataUploadRequest.name, schema: MasterDataUploadRequestSchema },
    ]),
  ],
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
