import { Injectable } from '@nestjs/common';
import { EventsGateway } from '../../events/events.gateway';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Notification } from './schemas/notification.schema';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  mergeNotificationPreferences,
  notificationTypeToCategory,
  type NotificationPreferences,
} from './notification-preferences.util';
import { serializeNotification } from './notification.util';

@Injectable()
export class NotificationTriggerService {
  constructor(
    private eventsGateway: EventsGateway,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
  ) {}

  private userObjectId(userId: string) {
    return Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;
  }

  private async emitUnreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({
      userId: this.userObjectId(userId),
      isRead: false,
    });
    this.eventsGateway.emitToUser(userId, 'notification:unread-count', { count });
    return count;
  }

  private async emitNotification(userId: string, notification: Notification) {
    const dto = serializeNotification(notification);
    this.eventsGateway.emitToUser(userId, 'notification:receive', dto);
    await this.emitUnreadCount(userId);
    return dto;
  }

  private async shouldNotifyUser(
    userId: string,
    type: string,
    category?: keyof NotificationPreferences,
  ): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('notificationPreferences').lean().exec();
    if (!user) return false;
    const prefs = mergeNotificationPreferences(
      user.notificationPreferences as Partial<NotificationPreferences>,
    );
    if (!prefs.enabled) return false;
    const key = category ?? notificationTypeToCategory(type);
    return Boolean(prefs[key]);
  }

  private async notifyUsers(
    userIds: string[],
    data: {
      title: string;
      message: string;
      type: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      actionUrl?: string;
      actionLabel?: string;
      metadata?: Record<string, unknown>;
      category?: keyof NotificationPreferences;
    },
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    for (const userId of uniqueUserIds) {
      await this.notifyUser(userId, data);
    }
  }

  /** Remove inbox alerts tied to a master/employee upload request. */
  async deleteByUploadRequestId(requestId: string) {
    try {
      const docs = await this.notificationModel
        .find({ 'metadata.requestId': requestId })
        .select('userId')
        .lean()
        .exec();
      if (!docs.length) return 0;
      const userIds = [...new Set(docs.map((doc) => String(doc.userId)))];
      const result = await this.notificationModel
        .deleteMany({ 'metadata.requestId': requestId })
        .exec();
      await Promise.all(userIds.map((userId) => this.emitUnreadCount(userId)));
      return result.deletedCount ?? 0;
    } catch (error) {
      console.error('Error deleting upload request notifications:', error);
      return 0;
    }
  }

  async deleteByUploadRequestIds(requestIds: string[]) {
    if (!requestIds.length) return 0;
    try {
      const docs = await this.notificationModel
        .find({ 'metadata.requestId': { $in: requestIds } })
        .select('userId')
        .lean()
        .exec();
      const userIds = [...new Set(docs.map((doc) => String(doc.userId)))];
      const result = await this.notificationModel
        .deleteMany({ 'metadata.requestId': { $in: requestIds } })
        .exec();
      await Promise.all(userIds.map((userId) => this.emitUnreadCount(userId)));
      return result.deletedCount ?? 0;
    } catch (error) {
      console.error('Error deleting upload request notifications:', error);
      return 0;
    }
  }

  /**
   * Send notification to specific user
   */
  async notifyUser(userId: string, data: {
    title: string;
    message: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
    category?: keyof NotificationPreferences;
  }) {
    try {
      if (!(await this.shouldNotifyUser(userId, data.type, data.category))) {
        return null;
      }

      const notification = await this.notificationModel.create({
        userId: this.userObjectId(userId),
        title: data.title,
        message: data.message,
        type: data.type,
        metadata: {
          priority: data.priority || 'medium',
          actionUrl: data.actionUrl,
          actionLabel: data.actionLabel,
          ...data.metadata,
        },
      });

      await this.emitNotification(userId, notification);

      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Send notification to all super admins
   */
  async notifySuperAdmins(data: {
    title: string;
    message: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
    category?: keyof NotificationPreferences;
  }, excludeUserIds: string[] = []) {
    try {
      const superAdmins = await this.userModel.find({
        roles: { $in: [SystemRole.SUPER_ADMIN, SystemRole.ADMIN] },
        isActive: { $ne: false },
      });
      await this.notifyUsers(
        superAdmins
          .map((admin) => admin._id.toString())
          .filter((userId) => !excludeUserIds.includes(userId)),
        data,
      );
    } catch (error) {
      console.error('Error notifying super admins:', error);
    }
  }

  /**
   * Send notification to all DB admins
   */
  async notifyDbAdmins(data: {
    title: string;
    message: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
    category?: keyof NotificationPreferences;
  }) {
    try {
      const dbAdmins = await this.userModel.find({
        roles: { $in: [SystemRole.DB_ADMIN] },
        isActive: { $ne: false },
      });
      await this.notifyUsers(
        dbAdmins.map((admin) => admin._id.toString()),
        data,
      );
    } catch (error) {
      console.error('Error notifying DB admins:', error);
    }
  }

  /**
   * Send notification to all employees
   */
  async notifyEmployees(data: {
    title: string;
    message: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      const employees = await this.userModel.find({ roles: 'employee' });
      await this.notifyUsers(
        employees.map((employee) => employee._id.toString()),
        data,
      );
    } catch (error) {
      console.error('Error notifying employees:', error);
    }
  }

  /**
   * Send notification to all users (system alert)
   */
  async notifyAll(data: {
    title: string;
    message: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      const users = await this.userModel.find();
      await this.notifyUsers(
        users.map((user) => user._id.toString()),
        data,
      );
    } catch (error) {
      console.error('Error notifying all users:', error);
    }
  }

  /**
   * Notify on user login
   */
  async notifyLogin(userId: string, userName: string) {
    await this.notifyUser(userId, {
      type: 'info',
      title: '👋 Welcome Back',
      message: `Welcome ${userName}! You're logged in.`,
      priority: 'low',
    });
  }

  /**
   * Notify on attendance marked
   */
  async notifyAttendanceMarked(
    userId: string,
    userName: string,
    date: string,
    status: string,
    checkInTime?: string,
    isLate?: boolean,
  ) {
    const timeLabel = checkInTime ? ` at ${checkInTime}` : '';

    if (status === 'leave' || status === 'absent' || isLate) {
      await this.notifyDbAdmins({
        type: 'activity_alert',
        category: 'attendanceAlerts',
        title: isLate ? 'Present (Late)' : 'Attendance update',
        message: isLate
          ? `${userName} marked Present (Late) on ${date}${timeLabel}`
          : `${userName} marked ${status} on ${date}`,
        priority: isLate ? 'high' : 'medium',
        actionUrl: '/db-admin/attendance',
        actionLabel: 'Review attendance',
        metadata: { userId, date, status, checkInTime, isLate },
      });
    }
  }

  /**
   * Notify on leave applied
   */
  async notifyLeaveApplied(userId: string, userName: string, leaveType: string, startDate: string, endDate: string) {
    // Notify the employee
    await this.notifyUser(userId, {
      type: 'info',
      category: 'leaveAlerts',
      title: 'Leave application submitted',
      message: `Your ${leaveType} leave request from ${startDate} to ${endDate} has been submitted`,
      priority: 'medium',
      actionUrl: '/employee/leave',
      actionLabel: 'View Leave',
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'warning',
      category: 'leaveAlerts',
      title: 'Leave application pending',
      message: `${userName} applied for ${leaveType} leave from ${startDate} to ${endDate}`,
      priority: 'high',
      actionUrl: '/db-admin/leave-management',
      actionLabel: 'Review Leave',
      metadata: { userId, leaveType, startDate, endDate },
    });

    // Notify super admins
    await this.notifySuperAdmins({
      type: 'warning',
      category: 'leaveAlerts',
      title: 'Leave application pending',
      message: `${userName} applied for ${leaveType} leave from ${startDate} to ${endDate}`,
      priority: 'high',
      actionUrl: '/admin/leave-management',
      actionLabel: 'Review Leave',
      metadata: { userId, leaveType, startDate, endDate },
    });
  }

  /**
   * Notify on leave approved
   */
  async notifyLeaveApproved(userId: string, userName: string, leaveType: string, startDate: string, endDate: string, approvedBy: string) {
    // Notify the employee
    await this.notifyUser(userId, {
      type: 'success',
      title: '✓ Leave Approved',
      message: `Your ${leaveType} leave from ${startDate} to ${endDate} has been approved by ${approvedBy}`,
      priority: 'high',
      actionUrl: '/employee/leave',
      actionLabel: 'View Leave',
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'success',
      title: '✓ Leave Approved',
      message: `${userName}'s ${leaveType} leave from ${startDate} to ${endDate} has been approved`,
      priority: 'medium',
      actionUrl: '/db-admin/leave-management',
      actionLabel: 'View Leave',
      metadata: { userId, leaveType, startDate, endDate, approvedBy },
    });

    // Notify super admins
    await this.notifySuperAdmins({
      type: 'success',
      title: '✓ Leave Approved',
      message: `${userName}'s ${leaveType} leave from ${startDate} to ${endDate} has been approved`,
      priority: 'medium',
      actionUrl: '/admin/leave-management',
      actionLabel: 'View Leave',
      metadata: { userId, leaveType, startDate, endDate, approvedBy },
    });
  }

  /**
   * Notify on leave rejected
   */
  async notifyLeaveRejected(userId: string, userName: string, leaveType: string, startDate: string, endDate: string, reason: string) {
    // Notify the employee
    await this.notifyUser(userId, {
      type: 'error',
      title: '✕ Leave Rejected',
      message: `Your ${leaveType} leave from ${startDate} to ${endDate} has been rejected. Reason: ${reason}`,
      priority: 'high',
      actionUrl: '/employee/leave',
      actionLabel: 'View Leave',
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'info',
      title: '✕ Leave Rejected',
      message: `${userName}'s ${leaveType} leave from ${startDate} to ${endDate} has been rejected`,
      priority: 'medium',
      actionUrl: '/db-admin/leave-management',
      actionLabel: 'View Leave',
      metadata: { userId, leaveType, startDate, endDate, reason },
    });

    // Notify super admins
    await this.notifySuperAdmins({
      type: 'info',
      title: '✕ Leave Rejected',
      message: `${userName}'s ${leaveType} leave from ${startDate} to ${endDate} has been rejected`,
      priority: 'medium',
      actionUrl: '/admin/leave-management',
      actionLabel: 'View Leave',
      metadata: { userId, leaveType, startDate, endDate, reason },
    });
  }

  /**
   * Notify on user created
   */
  async notifyUserCreated(email: string, role: string) {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'info',
      title: '👤 New User Created',
      message: `New ${role} user "${email}" has been created`,
      priority: 'low',
      actionUrl: '/admin/users',
      actionLabel: 'View User',
      metadata: { email, role },
    });

    // Notify DB admins if it's an employee
    if (role === 'employee') {
      await this.notifyDbAdmins({
        type: 'info',
        title: '👤 New Employee Added',
        message: `New employee "${email}" has been added to the system`,
        priority: 'low',
        actionUrl: '/db-admin/team',
        actionLabel: 'View Employee',
        metadata: { email, role },
      });
    }
  }

  /**
   * Notify on batch created
   */
  async notifyBatchCreated(batchName: string, createdBy: string) {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'batch_created',
      title: '📦 Batch Created',
      message: `Batch "${batchName}" has been created by ${createdBy}`,
      priority: 'medium',
      actionUrl: '/admin/batches',
      actionLabel: 'View Batch',
      metadata: { batchName, createdBy },
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'batch_created',
      title: '📦 Batch Created',
      message: `Batch "${batchName}" has been created by ${createdBy}`,
      priority: 'medium',
      actionUrl: '/db-admin/batches',
      actionLabel: 'View Batch',
      metadata: { batchName, createdBy },
    });
  }

  /**
   * Notify on batch updated
   */
  async notifyBatchUpdated(batchName: string, updatedBy: string) {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'batch_updated',
      title: '✏️ Batch Updated',
      message: `Batch "${batchName}" has been updated by ${updatedBy}`,
      priority: 'medium',
      actionUrl: '/admin/batches',
      actionLabel: 'View Batch',
      metadata: { batchName, updatedBy },
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'batch_updated',
      title: '✏️ Batch Updated',
      message: `Batch "${batchName}" has been updated by ${updatedBy}`,
      priority: 'medium',
      actionUrl: '/db-admin/batches',
      actionLabel: 'View Batch',
      metadata: { batchName, updatedBy },
    });
  }

  /**
   * Notify on batch deleted
   */
  async notifyBatchDeleted(batchName: string, deletedBy: string) {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'warning',
      title: '🗑️ Batch Deleted',
      message: `Batch "${batchName}" has been deleted by ${deletedBy}`,
      priority: 'medium',
      actionUrl: '/admin/batches',
      actionLabel: 'View Batches',
      metadata: { batchName, deletedBy },
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'warning',
      title: '🗑️ Batch Deleted',
      message: `Batch "${batchName}" has been deleted by ${deletedBy}`,
      priority: 'medium',
      actionUrl: '/db-admin/batches',
      actionLabel: 'View Batches',
      metadata: { batchName, deletedBy },
    });
  }

  /**
   * Notify on data uploaded
   */
  async notifyDataUploaded(rowCount: number, uploadedBy: string) {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'data_uploaded',
      title: '📤 Data Uploaded',
      message: `${rowCount.toLocaleString()} rows uploaded successfully by ${uploadedBy}`,
      priority: 'medium',
      actionUrl: '/admin/master-data-upload/requests',
      actionLabel: 'Review request',
      metadata: { rowCount, uploadedBy },
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'data_uploaded',
      title: '📤 Data Uploaded',
      message: `${rowCount.toLocaleString()} rows uploaded successfully by ${uploadedBy}`,
      priority: 'medium',
      actionUrl: '/db-admin/master-data-upload',
      actionLabel: 'View Upload',
      metadata: { rowCount, uploadedBy },
    });
  }

  /**
   * Notify system alert to all admins
   */
  async notifySystemAlert(message: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'high') {
    // Notify super admins
    await this.notifySuperAdmins({
      type: 'system_alert',
      title: '🔔 System Alert',
      message: message,
      priority: severity,
      metadata: { severity },
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'system_alert',
      title: '🔔 System Alert',
      message: message,
      priority: severity,
      metadata: { severity },
    });
  }
}
