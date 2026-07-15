import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QcEntry, QcEntrySchema } from './schemas/qc-entry.schema';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema';
import {
  DispositionEntry,
  DispositionEntrySchema,
} from '../disposition/schemas/disposition-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QcEntry.name, schema: QcEntrySchema },
      { name: DispositionEntry.name, schema: DispositionEntrySchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
  ],
  controllers: [QcController],
  providers: [QcService],
  exports: [QcService],
})
export class QcModule {}
