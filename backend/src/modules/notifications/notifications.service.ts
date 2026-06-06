import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from './schemas/notification.schema';
import { EventsGateway } from '../../events/events.gateway';
import { NotificationDto, serializeNotification } from './notification.util';
import { User } from '../users/schemas/user.schema';
import {
  mergeNotificationPreferences,
  NotificationPreferences,
  notificationTypeToCategory,
} from './notification-preferences.util';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private model: Model<Notification>,
    @InjectModel(User.name) private userModel: Model<User>,
    private eventsGateway: EventsGateway,
  ) {}

  private userObjectId(userId: string) {
    return Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;
  }

  private async emitUnreadCount(userId: string) {
    const count = await this.getUnreadCount(userId);
    this.eventsGateway.emitToUser(userId, 'notification:unread-count', { count });
    return count;
  }

  async create(userId: string, data: { title: string; message: string; type?: string }) {
    const notification = await this.model.create({ userId: this.userObjectId(userId), ...data });
    const dto = serializeNotification(notification.toObject());
    this.eventsGateway.emitToUser(userId, 'notification:receive', dto);
    await this.emitUnreadCount(userId);
    return dto;
  }

  async findByUser(userId: string, limit = 50): Promise<NotificationDto[]> {
    const rows = await this.model
      .find({ userId: this.userObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map((row) => serializeNotification(row));
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.model.countDocuments({ userId: this.userObjectId(userId), isRead: false });
  }

  async markAsRead(id: string, userId: string): Promise<NotificationDto | null> {
    const updated = await this.model.findOneAndUpdate(
      { _id: id, userId: this.userObjectId(userId), isRead: false },
      { isRead: true },
      { new: true },
    );
    if (!updated) return null;
    await this.emitUnreadCount(userId);
    return serializeNotification(updated);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.model.updateMany(
      { userId: this.userObjectId(userId), isRead: false },
      { isRead: true },
    );
    await this.emitUnreadCount(userId);
    return result.modifiedCount ?? 0;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const deleted = await this.model.findOneAndDelete({ _id: id, userId: this.userObjectId(userId) });
    if (deleted) {
      await this.emitUnreadCount(userId);
      return true;
    }
    return false;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.userModel.findById(userId).select('notificationPreferences').lean().exec();
    if (!user) throw new NotFoundException('User not found');
    return mergeNotificationPreferences(user.notificationPreferences as Partial<NotificationPreferences>);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...dto };
    await this.userModel.findByIdAndUpdate(userId, { notificationPreferences: next }).exec();
    return next;
  }

  async shouldDeliverNotification(userId: string, type: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.enabled) return false;
    const category = notificationTypeToCategory(type);
    if (category === 'enabled') return true;
    return Boolean(prefs[category]);
  }
}
