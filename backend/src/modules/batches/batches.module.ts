import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Batch, BatchSchema } from './schemas/batch.schema';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { BatchHierarchyService } from './batch-hierarchy.service';
import { UsersModule } from '../users/users.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { ActivityLog, ActivityLogSchema } from '../activity-logs/schemas/activity-log.schema';

@Module({
  imports: [
    UsersModule,
    ActivityLogsModule,
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [BatchesController],
  providers: [BatchesService, BatchHierarchyService],
  exports: [BatchesService],
})
export class BatchesModule {}
