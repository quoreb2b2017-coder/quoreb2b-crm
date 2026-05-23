import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import {
  MasterDataRecord,
  MasterDataSchema,
} from './schemas/master-data.schema';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [
    ActivityLogsModule,
    BatchesModule,
    MongooseModule.forFeature([
      { name: MasterDataRecord.name, schema: MasterDataSchema },
    ]),
  ],
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
