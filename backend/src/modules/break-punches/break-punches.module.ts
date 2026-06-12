import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BreakPunch, BreakPunchSchema } from './schemas/break-punch.schema';
import {
  MeetingBreakRequest,
  MeetingBreakRequestSchema,
} from './schemas/meeting-break-request.schema';
import { BreakPunchesService } from './break-punches.service';
import { BreakPunchesController } from './break-punches.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../../events/events.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BreakPunch.name, schema: BreakPunchSchema },
      { name: MeetingBreakRequest.name, schema: MeetingBreakRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    forwardRef(() => EventsModule),
  ],
  providers: [BreakPunchesService],
  controllers: [BreakPunchesController],
  exports: [BreakPunchesService],
})
export class BreakPunchesModule {}
