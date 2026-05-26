# Real-Time Notification System - Quick Start Guide

## ✅ Frontend Setup (Already Done)

### Files Created:
```
src/
├── types/
│   └── notifications.ts              # Types & constants
├── store/
│   └── notification.store.ts         # Zustand store
├── lib/notifications/
│   └── notification.service.ts       # Socket.io service
├── hooks/
│   └── useNotifications.ts           # Custom hook
└── components/notifications/
    ├── NotificationToast.tsx         # Toast component
    ├── NotificationBell.tsx          # Bell + dropdown
    └── NotificationProvider.tsx      # Provider
```

### Already Integrated:
- ✅ AppProviders includes NotificationProvider
- ✅ DashboardLayout includes NotificationBell
- ✅ Socket.io client configured
- ✅ Zustand store ready

## 🚀 Quick Start

### 1. Frontend is Ready!
No additional setup needed. The notification system is fully integrated.

### 2. Backend Setup (NestJS)

#### Step 1: Install Dependencies
```bash
cd backend
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

#### Step 2: Create Gateway
Copy the code from `BACKEND_NOTIFICATION_SETUP.md`:
- `NotificationsGateway` - WebSocket gateway
- `NotificationsService` - Database operations
- `NotificationsController` - REST endpoints

#### Step 3: Register in Module
```typescript
// src/app.module.ts
import { NotificationsGateway } from './notifications/notifications.gateway';
import { NotificationsService } from './notifications/notifications.service';

@Module({
  providers: [NotificationsGateway, NotificationsService],
})
export class AppModule {}
```

#### Step 4: Create Notification Schema
```typescript
// src/notifications/schemas/notification.schema.ts
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

  @Prop({ default: false })
  read: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}
```

### 3. Send Notifications from Backend

#### Example: Batch Created
```typescript
// In batch.service.ts
async createBatch(userId: string, batchData: any) {
  const batch = await this.batchModel.create(batchData);
  
  // Send notification
  this.notificationsGateway.notifyBatchCreated(userId, batch);
  
  return batch;
}
```

#### Example: System Alert
```typescript
// Notify all admins
const adminIds = await this.userService.findAdminIds();
this.notificationsGateway.sendToUsers(adminIds, 'notification:system-alert', {
  title: 'System Maintenance',
  message: 'System will be down for maintenance',
  priority: 'critical',
});
```

## 📱 Frontend Usage

### Use in Components
```typescript
import { useNotifications } from '@/hooks/useNotifications';

export function MyComponent() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead,
    deleteNotification 
  } = useNotifications();

  return (
    <div>
      <p>Unread: {unreadCount}</p>
      {notifications.map(n => (
        <div key={n.id}>
          <h3>{n.title}</h3>
          <p>{n.message}</p>
          <button onClick={() => markAsRead(n.id)}>Mark Read</button>
          <button onClick={() => deleteNotification(n.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## 🔔 Notification Types

### Available Types:
```typescript
'success'           // ✓ Green
'error'             // ✕ Red
'warning'           // ⚠ Yellow
'info'              // ℹ Blue
'batch_created'     // 📦 Indigo
'batch_updated'     // 🔄 Violet
'batch_completed'   // ✓ Green
'user_added'        // 👤 Blue
'data_uploaded'     // 📤 Indigo
'system_alert'      // 🔔 Red
'activity_alert'    // 📊 Yellow
```

### Priority Levels:
```typescript
'low'       // Auto-dismiss in 6s
'medium'    // Auto-dismiss in 6s
'high'      // Manual dismiss
'critical'  // Manual dismiss
```

## 🎨 UI Components

### NotificationBell (Header)
- Shows unread count badge
- Dropdown panel with notifications
- Mark all as read button
- Delete individual notifications

### NotificationToast (Bottom-right)
- Auto-dismiss for low/medium priority
- Manual dismiss for high/critical
- Action button with navigation
- Smooth animations

## 🧪 Testing

### Test 1: Send Notification
```bash
# Backend
curl -X POST http://localhost:4000/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 2: Check Socket Connection
1. Open browser DevTools
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Should see connection to `/events`

### Test 3: Receive Notification
1. Backend sends notification
2. Toast appears at bottom-right
3. Bell icon shows unread count
4. Click bell to see dropdown

## 📊 Socket Events

### Incoming (Backend → Frontend)
```
notification:receive
notification:batch-created
notification:batch-updated
notification:batch-completed
notification:user-added
notification:data-uploaded
notification:system-alert
notification:activity-alert
notification:unread-count
```

### Outgoing (Frontend → Backend)
```
notification:mark-read
notification:mark-all-read
notification:delete
```

## 🔧 Configuration

### Environment Variables
```env
# Frontend (.env.local)
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000

# Backend (.env)
SOCKET_IO_CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key
```

## 📝 API Endpoints

```
GET  /notifications?limit=20&offset=0    # Get notifications
GET  /notifications/unread-count         # Get unread count
POST /notifications/:id/read             # Mark as read
POST /notifications/read-all             # Mark all as read
DELETE /notifications/:id                # Delete notification
```

## 🐛 Troubleshooting

### Notifications not appearing?
1. Check Socket.io connection in DevTools
2. Verify backend is emitting events
3. Check browser console for errors

### Toast not auto-dismissing?
1. Check priority level (high/critical don't auto-dismiss)
2. Verify timeout is set correctly

### Unread count not updating?
1. Check `notification:unread-count` event
2. Verify backend is sending count

### Bell icon not showing?
1. Verify NotificationBell is imported in DashboardLayout
2. Check CSS classes are applied
3. Verify component is rendered

## 📚 Documentation

- **Frontend**: `NOTIFICATION_SYSTEM.md`
- **Backend**: `BACKEND_NOTIFICATION_SETUP.md`
- **Types**: `src/types/notifications.ts`

## ✨ Features

✅ Real-time notifications via Socket.io
✅ Toast notifications (auto-dismiss)
✅ Notification bell with dropdown
✅ Unread count badge
✅ Mark as read / Mark all as read
✅ Delete notifications
✅ Action buttons with navigation
✅ Priority-based styling
✅ Persistent notification history
✅ Multiple notification types
✅ Smooth animations

## 🎯 Next Steps

1. **Backend Setup**: Follow `BACKEND_NOTIFICATION_SETUP.md`
2. **Test Connection**: Verify Socket.io connection
3. **Send Test Notification**: Use backend endpoint
4. **Verify UI**: Check toast and bell appear
5. **Test Interactions**: Mark read, delete, navigate

## 🚀 You're All Set!

Frontend is ready. Just set up the backend and start sending notifications!

Questions? Check the documentation files or the code comments.

**Happy notifying! 🎉**
