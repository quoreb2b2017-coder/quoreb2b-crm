import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MasterDataRecord, MasterDataSchema } from '../master-data/schemas/master-data.schema';
import { MasterDataChunk, MasterDataChunkSchema } from '../master-data/schemas/master-data-chunk.schema';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema';
import {
  ActivityLog,
  ActivityLogSchema,
} from '../activity-logs/schemas/activity-log.schema';
import { HealthModule } from '../../health/health.module';
import { BatchesModule } from '../batches/batches.module';
import { MasterDataModule } from '../master-data/master-data.module';

@Module({
  imports: [
    HealthModule,
    BatchesModule,
    forwardRef(() => MasterDataModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: MasterDataRecord.name, schema: MasterDataSchema },
      { name: MasterDataChunk.name, schema: MasterDataChunkSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
