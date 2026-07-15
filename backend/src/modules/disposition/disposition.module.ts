import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DispositionEntry,
  DispositionEntrySchema,
} from './schemas/disposition-entry.schema';
import {
  CallbackReminder,
  CallbackReminderSchema,
} from './schemas/callback-reminder.schema';
import { DispositionService } from './disposition.service';
import { DispositionController } from './disposition.controller';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema';
import { QcEntry, QcEntrySchema } from '../qc/schemas/qc-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DispositionEntry.name, schema: DispositionEntrySchema },
      { name: CallbackReminder.name, schema: CallbackReminderSchema },
      { name: QcEntry.name, schema: QcEntrySchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
  ],
  controllers: [DispositionController],
  providers: [DispositionService],
  exports: [DispositionService],
})
export class DispositionModule {}
