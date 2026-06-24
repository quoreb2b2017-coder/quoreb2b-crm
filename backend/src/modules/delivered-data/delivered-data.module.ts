import { Module, forwardRef } from '@nestjs/common';
import {
  DeliveredDataController,
  SuppressionDataController,
} from './delivered-data.controller';
import { SuppressionDataService } from './delivered-data.service';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { BatchesModule } from '../batches/batches.module';
import { MasterDataModule } from '../master-data/master-data.module';

@Module({
  imports: [ActivityLogsModule, forwardRef(() => BatchesModule), forwardRef(() => MasterDataModule)],
  controllers: [SuppressionDataController, DeliveredDataController],
  providers: [SuppressionDataService],
  exports: [SuppressionDataService],
})
export class SuppressionDataModule {}

/** @deprecated */
export const DeliveredDataModule = SuppressionDataModule;
