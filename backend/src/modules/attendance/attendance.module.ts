import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Attendance, AttendanceSchema } from './schemas/attendance.schema';
import { AttendanceService } from './attendance.service';
import { AttendanceSchedulerService } from './attendance-scheduler.service';
import { AttendanceController } from './attendance.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { BreakPunchesModule } from '../break-punches/break-punches.module';
import { ActivityLog, ActivityLogSchema } from '../activity-logs/schemas/activity-log.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificationsModule,
    BreakPunchesModule,
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: User.name, schema: UserSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  providers: [AttendanceService, AttendanceSchedulerService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
