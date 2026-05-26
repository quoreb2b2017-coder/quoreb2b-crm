# Notification Integration Guide

Complete guide to integrate notifications into your backend modules.

---

## Overview

The `NotificationTriggerService` automatically sends notifications to users based on their roles:

- **Super Admin**: Receives all notifications
- **DB Admin**: Receives admin alerts, leave applications, attendance updates
- **Employee**: Receives personal notifications (attendance, leave status)

---

## Integration Steps

### Step 1: Import NotificationTriggerService

In your module file (e.g., `attendance.module.ts`):

```typescript
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([...]),
    NotificationsModule, // Add this
  ],
  controllers: [...],
  providers: [...],
})
export class AttendanceModule {}
```

### Step 2: Inject Service

In your service file (e.g., `attendance.service.ts`):

```typescript
import { NotificationTriggerService } from '../notifications/notification-trigger.service';

@Injectable()
export class AttendanceService {
  constructor(
    private notificationTriggerService: NotificationTriggerService,
    // ... other dependencies
  ) {}
}
```

---

## Integration Examples

### Attendance Module

#### Mark Attendance

```typescript
async markAttendance(userId: string, data: MarkAttendanceDto) {
  const user = await this.userModel.findById(userId);
  const attendance = await this.model.create({
    userId,
    date: data.date,
    status: data.status,
    checkInTime: data.checkInTime,
    checkOutTime: data.checkOutTime,
    hoursWorked: data.hoursWorked,
  });

  // Send notification
  await this.notificationTriggerService.notifyAttendanceMarked(
    userId,
    `${user.firstName} ${user.lastName}`,
    new Date(data.date).toLocaleDateString(),
    data.status,
  );

  return attendance;
}
```

---

### Leave Module

#### Apply for Leave

```typescript
async applyLeave(userId: string, data: ApplyLeaveDto) {
  const user = await this.userModel.findById(userId);
  const leave = await this.model.create({
    userId,
    leaveType: data.leaveType,
    startDate: data.startDate,
    endDate: data.endDate,
    numberOfDays: data.numberOfDays,
    reason: data.reason,
    status: 'pending',
  });

  // Send notification
  await this.notificationTriggerService.notifyLeaveApplied(
    userId,
    `${user.firstName} ${user.lastName}`,
    data.leaveType,
    new Date(data.startDate).toLocaleDateString(),
    new Date(data.endDate).toLocaleDateString(),
  );

  return leave;
}
```

#### Approve Leave

```typescript
async approveLeave(leaveId: string, approvedBy: string) {
  const leave = await this.model.findByIdAndUpdate(
    leaveId,
    { status: 'approved', approvedBy },
    { new: true },
  );

  const user = await this.userModel.findById(leave.userId);
  const approver = await this.userModel.findById(approvedBy);

  // Send notification
  await this.notificationTriggerService.notifyLeaveApproved(
    leave.userId.toString(),
    `${user.firstName} ${user.lastName}`,
    leave.leaveType,
    new Date(leave.startDate).toLocaleDateString(),
    new Date(leave.endDate).toLocaleDateString(),
    `${approver.firstName} ${approver.lastName}`,
  );

  return leave;
}
```

#### Reject Leave

```typescript
async rejectLeave(leaveId: string, reason: string) {
  const leave = await this.model.findByIdAndUpdate(
    leaveId,
    { status: 'rejected' },
    { new: true },
  );

  const user = await this.userModel.findById(leave.userId);

  // Send notification
  await this.notificationTriggerService.notifyLeaveRejected(
    leave.userId.toString(),
    `${user.firstName} ${user.lastName}`,
    leave.leaveType,
    new Date(leave.startDate).toLocaleDateString(),
    new Date(leave.endDate).toLocaleDateString(),
    reason,
  );

  return leave;
}
```

---

### Users Module

#### Create User

```typescript
async createUser(data: CreateUserDto) {
  const user = await this.model.create({
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    roles: data.roles,
    // ... other fields
  });

  // Send notification
  await this.notificationTriggerService.notifyUserCreated(
    data.email,
    data.roles[0] || 'user',
  );

  return user;
}
```

---

### Batch Module (if exists)

#### Create Batch

```typescript
async createBatch(userId: string, data: CreateBatchDto) {
  const user = await this.userModel.findById(userId);
  const batch = await this.model.create({
    name: data.name,
    createdBy: userId,
    // ... other fields
  });

  // Send notification
  await this.notificationTriggerService.notifyBatchCreated(
    data.name,
    `${user.firstName} ${user.lastName}`,
  );

  return batch;
}
```

#### Update Batch

```typescript
async updateBatch(batchId: string, userId: string, data: UpdateBatchDto) {
  const user = await this.userModel.findById(userId);
  const batch = await this.model.findByIdAndUpdate(batchId, data, { new: true });

  // Send notification
  await this.notificationTriggerService.notifyBatchUpdated(
    batch.name,
    `${user.firstName} ${user.lastName}`,
  );

  return batch;
}
```

#### Delete Batch

```typescript
async deleteBatch(batchId: string, userId: string) {
  const user = await this.userModel.findById(userId);
  const batch = await this.model.findByIdAndDelete(batchId);

  // Send notification
  await this.notificationTriggerService.notifyBatchDeleted(
    batch.name,
    `${user.firstName} ${user.lastName}`,
  );

  return batch;
}
```

---

## Available Notification Methods

### User-Specific Notifications

```typescript
// Notify specific user
await this.notificationTriggerService.notifyUser(userId, {
  title: 'Title',
  message: 'Message',
  type: 'info',
  priority: 'medium',
  actionUrl: '/path',
  actionLabel: 'Action',
});

// Notify on login
await this.notificationTriggerService.notifyLogin(userId, userName);

// Notify on attendance marked
await this.notificationTriggerService.notifyAttendanceMarked(
  userId,
  userName,
  date,
  status,
);

// Notify on leave applied
await this.notificationTriggerService.notifyLeaveApplied(
  userId,
  userName,
  leaveType,
  startDate,
  endDate,
);

// Notify on leave approved
await this.notificationTriggerService.notifyLeaveApproved(
  userId,
  userName,
  leaveType,
  startDate,
  endDate,
  approvedBy,
);

// Notify on leave rejected
await this.notificationTriggerService.notifyLeaveRejected(
  userId,
  userName,
  leaveType,
  startDate,
  endDate,
  reason,
);
```

### Role-Based Notifications

```typescript
// Notify all super admins
await this.notificationTriggerService.notifySuperAdmins({
  title: 'Title',
  message: 'Message',
  type: 'info',
  priority: 'medium',
});

// Notify all DB admins
await this.notificationTriggerService.notifyDbAdmins({
  title: 'Title',
  message: 'Message',
  type: 'info',
  priority: 'medium',
});

// Notify all employees
await this.notificationTriggerService.notifyEmployees({
  title: 'Title',
  message: 'Message',
  type: 'info',
  priority: 'medium',
});

// Notify all users (system alert)
await this.notificationTriggerService.notifyAll({
  title: 'Title',
  message: 'Message',
  type: 'system_alert',
  priority: 'critical',
});
```

### Activity Notifications

```typescript
// Notify on user created
await this.notificationTriggerService.notifyUserCreated(email, role);

// Notify on batch created
await this.notificationTriggerService.notifyBatchCreated(batchName, createdBy);

// Notify on batch updated
await this.notificationTriggerService.notifyBatchUpdated(batchName, updatedBy);

// Notify on batch deleted
await this.notificationTriggerService.notifyBatchDeleted(batchName, deletedBy);

// Notify on data uploaded
await this.notificationTriggerService.notifyDataUploaded(rowCount, uploadedBy);

// Notify system alert
await this.notificationTriggerService.notifySystemAlert(message, severity);
```

---

## Notification Types

| Type | Color | Use Case |
|------|-------|----------|
| success | Green | Operation successful |
| error | Red | Operation failed |
| warning | Yellow | Warning message |
| info | Blue | Information |
| batch_created | Indigo | Batch created |
| batch_updated | Violet | Batch updated |
| data_uploaded | Indigo | Data uploaded |
| user_added | Blue | User added |
| system_alert | Red | System alert |

---

## Priority Levels

- **low**: General information
- **medium**: Important updates
- **high**: Urgent actions needed
- **critical**: System alerts

---

## Testing Notifications

### Test in Development

1. Open browser console
2. Check for socket connection: `socket.connected`
3. Trigger an action (mark attendance, apply leave, etc.)
4. Check notification bell for new notification

### Test with Postman

```bash
# Mark attendance (triggers notification)
POST http://localhost:4000/api/v1/attendance/mark
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2024-01-15",
  "status": "present",
  "checkInTime": "09:00",
  "checkOutTime": "17:00",
  "hoursWorked": 8
}
```

---

## Troubleshooting

### Notifications Not Appearing

1. **Check Socket Connection**
   - Verify `SOCKET_CORS_ORIGINS` in backend `.env`
   - Check browser console for socket errors
   - Verify `NEXT_PUBLIC_SOCKET_URL` in frontend `.env.local`

2. **Check User Roles**
   - Verify user has correct role in database
   - Check role-based filtering logic

3. **Check Database**
   - Verify notifications are saved in MongoDB
   - Check notification collection: `db.notifications.find()`

4. **Check Logs**
   - Backend logs: `npm run dev:api`
   - Frontend console: Browser DevTools

### Notifications Sent to Wrong Users

- Verify `notifyUser()` receives correct userId
- Check role-based filtering in `notification.service.ts`
- Verify user roles in database

---

## Best Practices

1. **Always include user name** in notifications for clarity
2. **Use appropriate priority levels** for different actions
3. **Include action URLs** for easy navigation
4. **Test notifications** before deploying to production
5. **Monitor notification logs** for errors
6. **Keep notification messages concise** and clear
7. **Use emojis** for better visual identification
8. **Include metadata** for tracking and debugging

---

## Next Steps

1. Import `NotificationsModule` in your modules
2. Inject `NotificationTriggerService` in your services
3. Add notification calls to your business logic
4. Test notifications in development
5. Deploy to production

---

**Notifications are now fully integrated!** 🎉
