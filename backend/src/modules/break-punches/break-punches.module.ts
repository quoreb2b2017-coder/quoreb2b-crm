import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BreakPunch, BreakPunchSchema } from './schemas/break-punch.schema';
import { BreakPunchesService } from './break-punches.service';
import { BreakPunchesController } from './break-punches.controller';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: BreakPunch.name, schema: BreakPunchSchema }]),
  ],
  providers: [BreakPunchesService],
  controllers: [BreakPunchesController],
  exports: [BreakPunchesService],
})
export class BreakPunchesModule {}
