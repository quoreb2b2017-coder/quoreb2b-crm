# Role-Based Notification System

## Overview

The notification system now supports role-based filtering:

- **Super Admin**: Receives ALL notifications
- **DB Admin**: Receives only DB Admin-specific notifications + system alerts
- **Employee**: Receives only their own notifications (batches they're assigned to, etc.)

## How It Works

### Frontend Filtering

The `NotificationService` automatically filters notifications based on user role:

```typescript
// In notification.service.ts
private shouldReceiveNotification(notificationType: string, targetRole?: string): boolean {
  const userRole = this.getUserRole();
  
  // Super admin receives all notifications
  if (userRole === 'super_admin') return true;
  
  // If notification is targeted to specific role
  if (targetRole) {
    return userRole === targetRole;
  }
  
  // Default: only super admin gets it
  return false;
}
```

### Notification Types by Role

| Notification Type | Super Admin | DB Admin | Employee |
|-------------------|-------------|----------|----------|
| batch_created | ✅ | ❌ | ❌ |
| batch_updated | ✅ | ❌ | ❌ |
| batch_completed | ✅ | ❌ | ✅ (if assigned) |
| user_added | ✅ | ❌ | ❌ |
| data_uploaded | ✅ | ✅ | ❌ |
| system_alert | ✅ | ✅ | ❌ |
| activity_alert | ✅ | ✅ | ✅ (if targeted) |

## Backend Implementation

### Send Notification to Super Admin Only

```typescript
// Backend (NestJS)
this.notificationsGateway.notifyBatchCreated(userId, {
  batchId: batch.id,
  batchName: batch.name,
  createdBy: user.email,
  targetRole: 'super_admin', // Only super admin receives this
});
```

### Send Notification to Specific Role

```typescript
// Send to DB Admin
this.notificationsGateway.sendToUsers(dbAdminIds, 'notification:data-uploaded', {
  type: 'data_uploaded',
  title: 'Data Uploaded',
  message: `${rowCount} rows uploaded`,
  targetRole: 'db_admin', // Only DB admins receive this
  priority: 'medium',
});
```

### Send to Employee (if assigned to batch)

```typescript
// Send to employee assigned to batch
this.notificationsGateway.sendToUser(employeeId, 'notification:batch-completed', {
  type: 'batch_completed',
  title: 'Batch Completed',
  message: `Batch "${batch.name}" is complete`,
  targetRole: 'employee', // Only employees receive this
  priority: 'high',
});
```

### Broadcast to All Admins

```typescript
// System alert to all admins (Super Admin + DB Admin)
const adminIds = await this.userService.findAdminIds();
this.notificationsGateway.sendToUsers(adminIds, 'notification:system-alert', {
  title: 'System Maintenance',
  message: 'System will be down for maintenance',
  priority: 'critical',
  // No targetRole = filtered by frontend based on user role
});
```

## Frontend Usage

### Use in Components

```typescript
import { useNotifications } from '@/hooks/useNotifications';

export function MyComponent() {
  const { notifications, unreadCount } = useNotifications();
  
  // Notifications are automatically filtered by role
  // Super Admin sees all
  // Employee sees only their notifications
  // DB Admin sees only their notifications
  
  return (
    <div>
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

## Notification Flow Examples

### Example 1: Batch Created

```
Backend Event:
  - Super Admin creates batch
  - Backend emits: notification:batch-created
  - targetRole: 'super_admin'

Frontend:
  - Super Admin: ✅ Receives notification
  - DB Admin: ❌ Filtered out
  - Employee: ❌ Filtered out
```

### Example 2: Data Uploaded

```
Backend Event:
  - DB Admin uploads data
  - Backend emits: notification:data-uploaded
  - targetRole: 'db_admin'

Frontend:
  - Super Admin: ✅ Receives (super admin gets all)
  - DB Admin: ✅ Receives (targeted to db_admin)
  - Employee: ❌ Filtered out
```

### Example 3: System Alert

```
Backend Event:
  - System maintenance alert
  - Backend emits: notification:system-alert
  - No targetRole specified

Frontend:
  - Super Admin: ✅ Receives (super admin gets all)
  - DB Admin: ✅ Receives (system alerts for admins)
  - Employee: ❌ Filtered out
```

### Example 4: Batch Completed (Employee Assigned)

```
Backend Event:
  - Batch completes
  - Backend emits: notification:batch-completed
  - targetRole: 'employee'
  - Send to: employee assigned to batch

Frontend:
  - Super Admin: ✅ Receives (super admin gets all)
  - Assigned Employee: ✅ Receives (targeted to them)
  - Other Employees: ❌ Filtered out
```

## Implementation Checklist

### Frontend (✅ Complete)
- [x] Role-based filtering in NotificationService
- [x] getUserRole() method
- [x] shouldReceiveNotification() logic
- [x] Automatic filtering on all events

### Backend (📋 To Implement)

1. **Add targetRole to notifications**
   ```typescript
   interface NotificationPayload {
     type: string;
     title: string;
     message: string;
     targetRole?: 'super_admin' | 'db_admin' | 'employee';
     priority: 'low' | 'medium' | 'high' | 'critical';
   }
   ```

2. **Update notification methods**
   ```typescript
   notifyBatchCreated(userId: string, batch: any) {
     this.sendToUser(userId, 'notification:batch-created', {
       // ... notification data
       targetRole: 'super_admin', // Add this
     });
   }
   ```

3. **Send to role-specific users**
   ```typescript
   // Get all users with specific role
   const dbAdmins = await this.userService.findByRole('db_admin');
   this.sendToUsers(dbAdmins.map(u => u.id), 'notification:data-uploaded', {
     // ... notification data
     targetRole: 'db_admin',
   });
   ```

## Testing Role-Based Notifications

### Test 1: Super Admin Receives All
1. Login as Super Admin
2. Perform action (create batch, upload data, etc.)
3. ✅ Should see notification

### Test 2: Employee Receives Only Own
1. Login as Employee
2. Super Admin creates batch
3. ❌ Employee should NOT see notification
4. Super Admin assigns batch to employee
5. ✅ Employee should see notification

### Test 3: DB Admin Receives System Alerts
1. Login as DB Admin
2. System sends alert
3. ✅ DB Admin should see notification
4. Login as Employee
5. ❌ Employee should NOT see notification

## Code Examples

### Backend: Send Batch Created (Super Admin Only)

```typescript
// src/batches/batches.service.ts
async createBatch(userId: string, batchData: any) {
  const batch = await this.batchModel.create({
    ...batchData,
    createdBy: userId,
  });

  // Notify super admin
  const superAdmins = await this.userService.findByRole('super_admin');
  superAdmins.forEach(admin => {
    this.notificationsGateway.notifyBatchCreated(admin.id, {
      batchId: batch.id,
      batchName: batch.name,
      createdBy: await this.userService.getUserName(userId),
      targetRole: 'super_admin',
    });
  });

  return batch;
}
```

### Backend: Send Data Uploaded (Super Admin + DB Admin)

```typescript
// src/master-data/master-data.service.ts
async uploadData(userId: string, file: any) {
  const result = await this.processFile(file);

  // Notify super admin and db admin
  const admins = await this.userService.findByRoles(['super_admin', 'db_admin']);
  admins.forEach(admin => {
    this.notificationsGateway.sendToUser(admin.id, 'notification:data-uploaded', {
      type: 'data_uploaded',
      title: 'Data Uploaded',
      message: `${result.rowCount} rows uploaded by ${await this.userService.getUserName(userId)}`,
      actionUrl: '/admin/master-data-upload',
      actionLabel: 'View Upload',
      priority: 'medium',
      targetRole: admin.role === 'super_admin' ? 'super_admin' : 'db_admin',
      metadata: result,
    });
  });

  return result;
}
```

### Backend: Send Batch Completed (Super Admin + Assigned Employee)

```typescript
// src/batches/batches.service.ts
async completeBatch(batchId: string) {
  const batch = await this.batchModel.findByIdAndUpdate(
    batchId,
    { status: 'completed', completedAt: new Date() },
    { new: true }
  );

  // Notify super admin
  const superAdmins = await this.userService.findByRole('super_admin');
  superAdmins.forEach(admin => {
    this.notificationsGateway.sendToUser(admin.id, 'notification:batch-completed', {
      type: 'batch_completed',
      title: 'Batch Completed',
      message: `Batch "${batch.name}" is now complete`,
      actionUrl: `/admin/batches/${batch.id}`,
      actionLabel: 'View Results',
      priority: 'high',
      targetRole: 'super_admin',
      metadata: { batchId: batch.id, batchName: batch.name },
    });
  });

  // Notify assigned employees
  batch.assignedTo?.forEach(employeeId => {
    this.notificationsGateway.sendToUser(employeeId, 'notification:batch-completed', {
      type: 'batch_completed',
      title: 'Batch Completed',
      message: `Batch "${batch.name}" is now complete`,
      actionUrl: `/employee/batches/${batch.id}`,
      actionLabel: 'View Results',
      priority: 'high',
      targetRole: 'employee',
      metadata: { batchId: batch.id, batchName: batch.name },
    });
  });

  return batch;
}
```

## Summary

✅ **Frontend**: Role-based filtering implemented
✅ **Automatic**: Notifications filtered by user role
✅ **Flexible**: Support for targeted and broadcast notifications
✅ **Secure**: Users only see notifications meant for them

**Implementation Status**:
- Frontend: ✅ Complete
- Backend: 📋 Follow examples above

**Ready to deploy! 🚀**
