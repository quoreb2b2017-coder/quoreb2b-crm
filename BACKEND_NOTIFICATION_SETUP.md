# Backend Integration Guide - Socket.io Notifications

## NestJS Backend Setup

### 1. Install Dependencies
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

### 2. Create Notification Gateway

```typescript
// src/notifications/notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'events',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string[]>(); // userId -> socketIds

  handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    if (!token) {
      client.disconnect();
      return;
    }

    // Verify token and get userId
    const userId = this.verifyToken(token);
    if (!userId) {
      client.disconnect();
      return;
    }

    // Store socket connection
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }
    this.userSockets.get(userId)!.push(client.id);

    console.log(`User ${userId} connected with socket ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Remove socket from map
    for (const [userId, socketIds] of this.userSockets.entries()) {
      const index = socketIds.indexOf(client.id);
      if (index > -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.userSockets.delete(userId);
        }
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  }

  @SubscribeMessage('notification:mark-read')
  async handleMarkRead(client: Socket, data: { notificationId: string }) {
    const userId = this.getUserIdFromSocket(client.id);
    if (!userId) return;

    // Update notification in database
    await this.notificationService.markAsRead(data.notificationId, userId);
  }

  @SubscribeMessage('notification:mark-all-read')
  async handleMarkAllRead(client: Socket) {
    const userId = this.getUserIdFromSocket(client.id);
    if (!userId) return;

    // Mark all as read in database
    await this.notificationService.markAllAsRead(userId);
  }

  @SubscribeMessage('notification:delete')
  async handleDelete(client: Socket, data: { notificationId: string }) {
    const userId = this.getUserIdFromSocket(client.id);
    if (!userId) return;

    // Delete notification from database
    await this.notificationService.deleteNotification(data.notificationId, userId);
  }

  // ─── Emit Methods ───────────────────────────────────────────────────────

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * Send notification to multiple users
   */
  sendToUsers(userIds: string[], event: string, data: any) {
    userIds.forEach(userId => this.sendToUser(userId, event, data));
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  /**
   * Send batch created notification
   */
  notifyBatchCreated(userId: string, batch: any) {
    this.sendToUser(userId, 'notification:batch-created', {
      type: 'batch_created',
      title: 'Batch Created',
      message: `Batch "${batch.name}" has been created`,
      actionUrl: `/admin/batches/${batch.id}`,
      actionLabel: 'View Batch',
      priority: 'medium',
      metadata: {
        batchId: batch.id,
        batchName: batch.name,
        rowCount: batch.rowCount,
      },
    });
  }

  /**
   * Send batch updated notification
   */
  notifyBatchUpdated(userId: string, batch: any) {
    this.sendToUser(userId, 'notification:batch-updated', {
      type: 'batch_updated',
      title: 'Batch Updated',
      message: `Batch "${batch.name}" has been updated`,
      actionUrl: `/admin/batches/${batch.id}`,
      actionLabel: 'View Batch',
      priority: 'medium',
      metadata: {
        batchId: batch.id,
        batchName: batch.name,
      },
    });
  }

  /**
   * Send batch completed notification
   */
  notifyBatchCompleted(userId: string, batch: any) {
    this.sendToUser(userId, 'notification:batch-completed', {
      type: 'batch_completed',
      title: 'Batch Completed',
      message: `Batch "${batch.name}" is now complete`,
      actionUrl: `/admin/batches/${batch.id}`,
      actionLabel: 'View Results',
      priority: 'high',
      metadata: {
        batchId: batch.id,
        batchName: batch.name,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Send user added notification
   */
  notifyUserAdded(adminId: string, user: any) {
    this.sendToUser(adminId, 'notification:user-added', {
      type: 'user_added',
      title: 'New User Added',
      message: `User "${user.email}" has been added to the system`,
      actionUrl: `/admin/users/${user.id}`,
      actionLabel: 'View User',
      priority: 'low',
      metadata: {
        userId: user.id,
        userName: user.email,
        role: user.role,
      },
    });
  }

  /**
   * Send data uploaded notification
   */
  notifyDataUploaded(userId: string, upload: any) {
    this.sendToUser(userId, 'notification:data-uploaded', {
      type: 'data_uploaded',
      title: 'Data Uploaded',
      message: `${upload.rowCount} rows uploaded successfully`,
      actionUrl: `/admin/master-data-upload`,
      actionLabel: 'View Upload',
      priority: 'medium',
      metadata: {
        uploadId: upload.id,
        rowCount: upload.rowCount,
        uploadedAt: new Date(),
      },
    });
  }

  /**
   * Send system alert
   */
  notifySystemAlert(userIds: string[], alert: any) {
    this.sendToUsers(userIds, 'notification:system-alert', {
      type: 'system_alert',
      title: alert.title || 'System Alert',
      message: alert.message,
      priority: 'critical',
      metadata: alert.metadata,
    });
  }

  /**
   * Send activity alert
   */
  notifyActivityAlert(userId: string, activity: any) {
    this.sendToUser(userId, 'notification:activity-alert', {
      type: 'activity_alert',
      title: 'Activity Alert',
      message: activity.message,
      priority: 'medium',
      metadata: activity.metadata,
    });
  }

  /**
   * Update unread count
   */
  updateUnreadCount(userId: string, count: number) {
    this.sendToUser(userId, 'notification:unread-count', count);
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private verifyToken(token: string): string | null {
    try {
      // Verify JWT token and extract userId
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.sub; // userId
    } catch {
      return null;
    }
  }

  private getUserIdFromSocket(socketId: string): string | null {
    for (const [userId, socketIds] of this.userSockets.entries()) {
      if (socketIds.includes(socketId)) {
        return userId;
      }
    }
    return null;
  }
}
```

### 3. Create Notification Service

```typescript
// src/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
  ) {}

  async create(userId: string, notification: any) {
    return this.notificationModel.create({
      userId,
      ...notification,
      createdAt: new Date(),
      read: false,
    });
  }

  async findByUser(userId: string, limit = 20, offset = 0) {
    return this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .exec();
  }

  async getUnreadCount(userId: string) {
    return this.notificationModel.countDocuments({
      userId,
      read: false,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { read: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    return this.notificationModel.updateMany(
      { userId, read: false },
      { read: true },
    );
  }

  async deleteNotification(notificationId: string, userId: string) {
    return this.notificationModel.findByIdAndDelete(notificationId);
  }
}
```

### 4. Create Notification Schema

```typescript
// src/notifications/schemas/notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Notification extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop()
  actionUrl?: string;

  @Prop()
  actionLabel?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: 'medium' })
  priority: 'low' | 'medium' | 'high' | 'critical';

  @Prop({ default: false })
  read: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
```

### 5. Register in Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications/notifications.gateway';
import { NotificationsService } from './notifications/notifications.service';

@Module({
  imports: [
    // ... other imports
  ],
  providers: [NotificationsGateway, NotificationsService],
})
export class AppModule {}
```

### 6. Create REST Endpoints

```typescript
// src/notifications/notifications.controller.ts
import { Controller, Get, Post, Delete, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '@/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser() userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    const notifications = await this.notificationsService.findByUser(
      userId,
      limit,
      offset,
    );
    return { data: notifications };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { data: count };
  }

  @Post(':id/read')
  async markAsRead(
    @Param('id') notificationId: string,
    @CurrentUser() userId: string,
  ) {
    await this.notificationsService.markAsRead(notificationId, userId);
    return { success: true };
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  @Delete(':id')
  async deleteNotification(
    @Param('id') notificationId: string,
    @CurrentUser() userId: string,
  ) {
    await this.notificationsService.deleteNotification(notificationId, userId);
    return { success: true };
  }
}
```

## Usage Examples

### Send Batch Created Notification
```typescript
// In batch.service.ts
constructor(private notificationsGateway: NotificationsGateway) {}

async createBatch(userId: string, batchData: any) {
  const batch = await this.batchModel.create(batchData);
  
  // Send notification
  this.notificationsGateway.notifyBatchCreated(userId, batch);
  
  return batch;
}
```

### Send to Multiple Users
```typescript
// Notify all admins
const adminIds = await this.userService.findAdminIds();
this.notificationsGateway.sendToUsers(adminIds, 'notification:system-alert', {
  title: 'System Maintenance',
  message: 'System will be down for maintenance',
  priority: 'critical',
});
```

### Broadcast to All
```typescript
// Notify everyone
this.notificationsGateway.broadcast('notification:system-alert', {
  title: 'Important Update',
  message: 'New features available',
  priority: 'high',
});
```

## Environment Variables

```env
# .env
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-secret-key
SOCKET_IO_CORS_ORIGIN=http://localhost:3000
```

## Testing

### Test Socket Connection
```bash
# Use Socket.io client to test
npm install -g socket.io-client

# Connect and listen
const io = require('socket.io-client');
const socket = io('http://localhost:4000/events', {
  auth: { token: 'your-jwt-token' }
});

socket.on('notification:batch-created', (data) => {
  console.log('Received:', data);
});
```

## Summary

✅ WebSocket gateway for real-time notifications
✅ Notification service for database operations
✅ REST endpoints for API access
✅ User socket tracking
✅ Multiple notification types
✅ Priority-based notifications
✅ Broadcast and targeted notifications

**Backend integration complete! 🚀**
