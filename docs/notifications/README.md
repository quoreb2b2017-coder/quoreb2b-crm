# Real-Time Notification System Documentation

Complete documentation for the Socket.io-based notification system.

## Quick Links

- **[Notification System](NOTIFICATION_SYSTEM.md)** - Core notification features
- **[Implementation Summary](NOTIFICATION_IMPLEMENTATION_SUMMARY.md)** - Implementation details
- **[Quick Start](NOTIFICATION_QUICK_START.md)** - Quick start guide
- **[Backend Setup](BACKEND_NOTIFICATION_SETUP.md)** - Backend configuration

## Key Features

✅ Real-time notifications via Socket.io
✅ Toast notifications with auto-dismiss
✅ Notification bell with dropdown panel
✅ Unread count badge
✅ Mark as read / Mark all as read
✅ Delete notifications
✅ Action buttons with navigation
✅ Priority-based styling
✅ Persistent notification history
✅ Role-based filtering

## Notification Types

| Type | Color | Use Case |
|------|-------|----------|
| success | Green | Operation successful |
| error | Red | Operation failed |
| warning | Yellow | Warning message |
| info | Blue | Information |
| batch_created | Indigo | Batch created |
| batch_updated | Violet | Batch updated |
| batch_completed | Green | Batch completed |
| user_added | Blue | User added |
| data_uploaded | Indigo | Data uploaded |
| system_alert | Red | System alert |

## Socket Events

### Incoming (Backend → Frontend)
- `notification:receive` - Generic notification
- `notification:batch-created` - Batch created
- `notification:batch-updated` - Batch updated
- `notification:batch-completed` - Batch completed
- `notification:user-added` - User added
- `notification:data-uploaded` - Data uploaded
- `notification:system-alert` - System alert
- `notification:unread-count` - Unread count update

### Outgoing (Frontend → Backend)
- `notification:mark-read` - Mark single as read
- `notification:mark-all-read` - Mark all as read
- `notification:delete` - Delete notification

## Role-Based Filtering

- **Super Admin**: All notifications
- **DB Admin**: Admin + system alerts
- **Employee**: Only personal notifications

## File Structure

```
frontend/crm-frontend/src/
├── types/notifications.ts
├── store/notification.store.ts
├── lib/notifications/notification.service.ts
├── hooks/useNotifications.ts
└── components/notifications/
    ├── NotificationToast.tsx
    ├── NotificationBell.tsx
    └── NotificationProvider.tsx
```

## Database Schema

### Notifications Collection
- userId (indexed)
- title
- message
- type
- priority: 'low' | 'medium' | 'high' | 'critical'
- isRead
- actionUrl (optional)
- createdAt
- updatedAt

## Automatic Triggers

Notifications are automatically triggered on:
- User login
- Batch creation
- Batch deletion
- Batch sharing
- Edit actions
- Leave application
- Leave approval/rejection
