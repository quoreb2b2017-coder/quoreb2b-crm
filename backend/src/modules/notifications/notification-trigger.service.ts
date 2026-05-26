import { Injectable } from '@nestjs/common';
import { EventsGateway } from '../../events/events.gateway';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Notification } from './schemas/notification.schema';

@Injectable()
export class NotificationTriggerService {
  constructor(
    private eventsGateway: EventsGateway,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
  ) {}

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
  }) {
    try {
      // Save to database
      const notification = await this.notificationModel.create({
        userId,
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

      // Emit via socket
      this.eventsGateway.emitToUser(userId, 'notification:receive', {
        type: data.type,
        title: data.title,
        message: data.message,
        priority: data.priority || 'medium',
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        metadata: data.metadata,
      });

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
  }) {
    try {
      const superAdmins = await this.userModel.find({ roles: 'super_admin' });
      
      for (const admin of superAdmins) {
        await this.notifyUser(admin._id.toString(), data);
      }
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
  }) {
    try {
      const dbAdmins = await this.userModel.find({ roles: 'db_admin' });
      
      for (const admin of dbAdmins) {
        await this.notifyUser(admin._id.toString(), data);
      }
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
      
      for (const employee of employees) {
        await this.notifyUser(employee._id.toString(), data);
      }
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
      
      for (const user of users) {
        await this.notifyUser(user._id.toString(), data);
      }
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
  async notifyAttendanceMarked(userId: string, userName: string, date: string, status: string) {
    // Notify the employee
    await this.notifyUser(userId, {
      type: 'success',
      title: '✓ Attendance Marked',
      message: `Your attendance for ${date} has been marked as ${status}`,
      priority: 'medium',
      actionUrl: '/employee/attendance',
      actionLabel: 'View Attendance',
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'info',
      title: '📋 Attendance Marked',
      message: `${userName} marked attendance as ${status} on ${date}`,
      priority: 'low',
      actionUrl: '/db-admin/attendance',
      actionLabel: 'View Attendance',
      metadata: { userId, date, status },
    });

    // Notify super admins
    await this.notifySuperAdmins({
      type: 'info',
      title: '📋 Attendance Marked',
      message: `${userName} marked attendance as ${status} on ${date}`,
      priority: 'low',
      actionUrl: '/admin/attendance',
      actionLabel: 'View Attendance',
      metadata: { userId, date, status },
    });
  }

  /**
   * Notify on leave applied
   */
  async notifyLeaveApplied(userId: string, userName: string, leaveType: string, startDate: string, endDate: string) {
    // Notify the employee
    await this.notifyUser(userId, {
      type: 'info',
      title: '📝 Leave Application Submitted',
      message: `Your ${leaveType} leave request from ${startDate} to ${endDate} has been submitted`,
      priority: 'medium',
      actionUrl: '/employee/leave',
      actionLabel: 'View Leave',
    });

    // Notify DB admins
    await this.notifyDbAdmins({
      type: 'warning',
      title: '⏳ Leave Application Pending',
      message: `${userName} applied for ${leaveType} leave from ${startDate} to ${endDate}`,
      priority: 'high',
      actionUrl: '/db-admin/leave-management',
      actionLabel: 'Review Leave',
      metadata: { userId, leaveType, startDate, endDate },
    });

    // Notify super admins
    await this.notifySuperAdmins({
      type: 'warning',
      title: '⏳ Leave Application Pending',
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
      actionUrl: '/admin/master-data-upload',
      actionLabel: 'View Upload',
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
