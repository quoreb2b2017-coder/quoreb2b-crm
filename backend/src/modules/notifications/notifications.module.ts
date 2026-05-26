import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationTriggerService } from './notification-trigger.service';
import { EventsModule } from '../../events/events.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => EventsModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationTriggerService],
  exports: [NotificationsService, NotificationTriggerService],
})
export class NotificationsModule {}
