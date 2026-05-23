import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema';
import { UsersRepository } from '../users/users.repository';
import { ActivityLoggingInterceptor } from '../../common/interceptors/activity-logging.interceptor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
  ],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService, UsersRepository, ActivityLoggingInterceptor],
  exports: [ActivityLogsService, ActivityLoggingInterceptor],
})
export class ActivityLogsModule {}
