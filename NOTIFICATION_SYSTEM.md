# Real-Time Notification System with Socket.io

## Overview

A complete real-time notification system using Socket.io with:
- ✅ Real-time notifications via WebSocket
- ✅ Toast notifications (auto-dismiss)
- ✅ Notification bell with dropdown panel
- ✅ Unread count badge
- ✅ Mark as read / Mark all as read
- ✅ Delete notifications
- ✅ Action buttons with navigation
- ✅ Priority-based styling
- ✅ Persistent notification history

## Architecture

```
Backend (NestJS)
    ↓ Socket.io Events
Frontend (Next.js)
    ↓
Socket Client (socket.client.ts)
    ↓
Notification Service (notification.service.ts)
    ↓
Zustand Store (notification.store.ts)
    ↓
Components:
  - NotificationBell (header icon + dropdown)
  - NotificationToast (auto-dismiss toast)
  - NotificationProvider (initialization)
```

## Files Created

### Core Files
1. **`src/types/notifications.ts`**
   - Notification types and interfaces
   - Event constants
   - Color mappings

2. **`src/store/notification.store.ts`**
   - Zustand store for notification state
   - Actions: add, remove, mark read, clear

3. **`src/lib/notifications/notification.service.ts`**
   - Socket.io event handlers
   - API calls for notifications
   - Mark as read/delete operations

4. **`src/hooks/useNotifications.ts`**
   - Custom hook for notifications
   - Initializes socket connection
   - Fetches initial notifications

### UI Components
5. **`src/components/notifications/NotificationToast.tsx`**
   - Toast notification display
   - Auto-dismiss logic
   - Action button support

6. **`src/components/notifications/NotificationBell.tsx`**
   - Bell icon with unread badge
   - Dropdown panel
   - Notification list

7. **`src/components/notifications/NotificationProvider.tsx`**
   - Provider component
   - Wraps app with notification system

## Notification Types

```typescript
type NotificationType = 
  | 'success'           // General success
  | 'error'             // General error
  | 'warning'           // General warning
  | 'info'              // General info
  | 'batch_created'     // Batch created
  | 'batch_updated'     // Batch updated
  | 'batch_completed'   // Batch completed
  | 'user_added'        // New user added
  | 'data_uploaded'     // Data uploaded
  | 'system_alert'      // System alert
  | 'activity_alert'    // Activity alert
```

## Priority Levels

```typescript
priority: 'low' | 'medium' | 'high' | 'critical'

// Auto-dismiss timing:
- low/medium: 6 seconds
- high/critical: Manual dismiss only
```

## Socket Events

### Incoming Events (Backend → Frontend)
```typescript
'notification:receive'        // Generic notification
'notification:batch-created'  // Batch created
'notification:batch-updated'  // Batch updated
'notification:batch-completed'// Batch completed
'notification:user-added'     // User added
'notification:data-uploaded'  // Data uploaded
'notification:system-alert'   // System alert
'notification:activity-alert' // Activity alert
'notification:unread-count'   // Unread count update
```

### Outgoing Events (Frontend → Backend)
```typescript
'notification:mark-read'      // Mark single as read
'notification:mark-all-read'  // Mark all as read
'notification:delete'         // Delete notification
```

## Usage

### 1. Initialize in App
Already done in `AppProviders.tsx`:
```typescript
<NotificationProvider>
  {children}
</NotificationProvider>
```

### 2. Use in Components
```typescript
import { useNotifications } from '@/hooks/useNotifications';

export function MyComponent() {
  const { 
    notifications, 
    unreadCount, 
    addNotification,
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
        </div>
      ))}
    </div>
  );
}
```

### 3. Send Notification from Backend
```typescript
// NestJS Backend
socket.emit('notification:receive', {
  type: 'batch_created',
  title: 'Batch Created',
  message: 'Batch "Q1 2024" has been created',
  actionUrl: '/admin/batches/123',
  actionLabel: 'View Batch',
  priority: 'medium',
  metadata: { batchId: '123', batchName: 'Q1 2024' }
});
```

## Features

### Toast Notifications
- Auto-dismiss after 6 seconds (low/medium priority)
- Manual dismiss for high/critical
- Smooth slide-in/out animation
- Action button with navigation
- Color-coded by type

### Notification Bell
- Unread count badge
- Dropdown panel with list
- Mark all as read button
- Delete individual notifications
- Time ago display
- Link to full notifications page

### Notification Store
- Max 50 notifications in memory
- Unread count tracking
- Mark as read/delete operations
- Clear all notifications

## Styling

### Colors by Type
```typescript
success/batch_completed:  Emerald (green)
error/system_alert:       Red
warning:                  Amber (yellow)
info/batch_created:       Indigo (blue)
batch_updated:            Violet (purple)
user_added:               Blue
data_uploaded:            Indigo
activity_alert:           Amber
```

### Priority Indicators
```typescript
low:      Gray bar
medium:   Blue bar
high:     Amber bar
critical: Red bar
```

## API Endpoints (Backend Required)

```typescript
GET /notifications?limit=20&offset=0
  - Fetch notifications

GET /notifications/unread-count
  - Get unread count

POST /notifications/:id/read
  - Mark as read

POST /notifications/read-all
  - Mark all as read

DELETE /notifications/:id
  - Delete notification
```

## Socket Connection

Automatically handled by `useNotifications()` hook:
1. Connects on component mount
2. Subscribes to all events
3. Fetches initial notifications
4. Fetches unread count
5. Cleans up on unmount

## Testing

### Test 1: Receive Notification
1. Backend emits `notification:receive`
2. Toast appears at bottom-right
3. Auto-dismisses after 6 seconds

### Test 2: Notification Bell
1. Click bell icon in header
2. Dropdown panel opens
3. Shows list of notifications
4. Unread count badge visible

### Test 3: Mark as Read
1. Click notification in panel
2. Blue dot disappears
3. Unread count decreases

### Test 4: Delete Notification
1. Hover over notification
2. Click trash icon
3. Notification removed

### Test 5: Action Button
1. Click action button in toast
2. Navigate to specified URL
3. Toast closes

## Performance

- **Memory**: Max 50 notifications stored
- **Network**: Only sends read/delete events
- **Rendering**: Memoized components
- **Updates**: Zustand for efficient state

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

## Troubleshooting

### Notifications not appearing?
1. Check Socket.io connection in DevTools
2. Verify backend is emitting events
3. Check notification service is subscribed

### Toast not auto-dismissing?
1. Check priority level (high/critical don't auto-dismiss)
2. Verify timeout is set correctly

### Unread count not updating?
1. Check `notification:unread-count` event
2. Verify backend is sending count

### Bell icon not showing?
1. Verify NotificationBell is imported
2. Check DashboardLayout includes it
3. Verify CSS classes are applied

## Future Enhancements

1. **Notification Preferences**
   - User can choose which types to receive
   - Mute notifications

2. **Notification Categories**
   - Group by type
   - Filter by category

3. **Notification History**
   - Full page with all notifications
   - Search and filter

4. **Sound/Desktop Notifications**
   - Browser notifications API
   - Sound alerts

5. **Notification Scheduling**
   - Schedule notifications
   - Batch send

## Summary

✅ Real-time notifications via Socket.io
✅ Toast + Bell UI components
✅ Zustand state management
✅ Auto-dismiss logic
✅ Action buttons with navigation
✅ Priority-based styling
✅ Unread count tracking
✅ Mark as read / Delete operations

**Ready to use! 🚀**
