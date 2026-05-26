import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './schemas/notification.schema';
import { EventsGateway } from '../../events/events.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private model: Model<Notification>,
    private eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, data: { title: string; message: string; type?: string }) {
    const notification = await this.model.create({ userId, ...data });
    this.eventsGateway.emitToUser(userId, 'notification', notification);
    return notification;
  }

  async findByUser(userId: string) {
    return this.model.find({ userId }).sort({ createdAt: -1 }).limit(50).exec();
  }

  async getUnreadCount(userId: string) {
    return this.model.countDocuments({ userId, isRead: false });
  }

  async markAsRead(id: string, userId: string) {
    return this.model.findOneAndUpdate({ _id: id, userId }, { isRead: true }, { new: true });
  }

  async markAllAsRead(userId: string) {
    return this.model.updateMany({ userId, isRead: false }, { isRead: true });
  }
}
