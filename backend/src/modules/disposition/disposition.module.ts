import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DispositionEntry,
  DispositionEntrySchema,
} from './schemas/disposition-entry.schema';
import { DispositionService } from './disposition.service';
import { DispositionController } from './disposition.controller';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DispositionEntry.name, schema: DispositionEntrySchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
  ],
  controllers: [DispositionController],
  providers: [DispositionService],
  exports: [DispositionService],
})
export class DispositionModule {}
