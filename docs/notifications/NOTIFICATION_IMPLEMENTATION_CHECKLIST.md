# Notification Implementation Checklist

Quick checklist to implement notifications in your backend modules.

---

## ✅ What's Done

- [x] Created `NotificationTriggerService` in backend
- [x] Updated `NotificationsModule` to export the service
- [x] Frontend notification system ready
- [x] Socket.io integration complete
- [x] Role-based filtering implemented

---

## 📋 Implementation Checklist

### Attendance Module

- [ ] Import `NotificationsModule` in `attendance.module.ts`
- [ ] Inject `NotificationTriggerService` in `attendance.service.ts`
- [ ] Add notification call in `markAttendance()` method:
  ```typescript
  await this.notificationTriggerService.notifyAttendanceMarked(
    userId,
    userName,
    date,
    status,
  );
  ```
- [ ] Test: Mark attendance and check notification bell

### Leave Module

- [ ] Import `NotificationsModule` in `leave.module.ts`
- [ ] Inject `NotificationTriggerService` in `leave.service.ts`
- [ ] Add notification call in `applyLeave()` method:
  ```typescript
  await this.notificationTriggerService.notifyLeaveApplied(
    userId,
    userName,
    leaveType,
    startDate,
    endDate,
  );
  ```
- [ ] Add notification call in `approveLeave()` method:
  ```typescript
  await this.notificationTriggerService.notifyLeaveApproved(
    userId,
    userName,
    leaveType,
    startDate,
    endDate,
    approvedBy,
  );
  ```
- [ ] Add notification call in `rejectLeave()` method:
  ```typescript
  await this.notificationTriggerService.notifyLeaveRejected(
    userId,
    userName,
    leaveType,
    startDate,
    endDate,
    reason,
  );
  ```
- [ ] Test: Apply leave, approve/reject and check notifications

### Users Module

- [ ] Import `NotificationsModule` in `users.module.ts`
- [ ] Inject `NotificationTriggerService` in `users.service.ts`
- [ ] Add notification call in `createUser()` method:
  ```typescript
  await this.notificationTriggerService.notifyUserCreated(
    email,
    role,
  );
  ```
- [ ] Test: Create user and check notification bell

### Batch Module (if exists)

- [ ] Import `NotificationsModule` in `batch.module.ts`
- [ ] Inject `NotificationTriggerService` in `batch.service.ts`
- [ ] Add notification call in `createBatch()` method:
  ```typescript
  await this.notificationTriggerService.notifyBatchCreated(
    batchName,
    createdBy,
  );
  ```
- [ ] Add notification call in `updateBatch()` method:
  ```typescript
  await this.notificationTriggerService.notifyBatchUpdated(
    batchName,
    updatedBy,
  );
  ```
- [ ] Add notification call in `deleteBatch()` method:
  ```typescript
  await this.notificationTriggerService.notifyBatchDeleted(
    batchName,
    deletedBy,
  );
  ```
- [ ] Test: Create, update, delete batch and check notifications

---

## 🧪 Testing Steps

### 1. Test Super Admin Notifications

- [ ] Login as Super Admin
- [ ] Perform action (mark attendance, create user, etc.)
- [ ] Check notification bell - should show notification
- [ ] Click notification - should navigate to correct page

### 2. Test DB Admin Notifications

- [ ] Login as DB Admin
- [ ] Perform action (apply leave, etc.)
- [ ] Check notification bell - should show relevant notifications
- [ ] Verify only DB Admin notifications appear

### 3. Test Employee Notifications

- [ ] Login as Employee
- [ ] Mark attendance
- [ ] Apply for leave
- [ ] Check notification bell - should show personal notifications only

### 4. Test Role-Based Filtering

- [ ] Super Admin should see: All notifications
- [ ] DB Admin should see: Admin alerts, leave applications, attendance updates
- [ ] Employee should see: Personal notifications only

### 5. Test Socket Connection

- [ ] Open browser DevTools → Network → WS
- [ ] Should see socket connection to `/events`
- [ ] Should see `notification:receive` events

---

## 🔧 Troubleshooting

### Notifications Not Appearing

**Check 1: Socket Connection**
```bash
# In browser console
socket.connected  # Should be true
socket.id         # Should show socket ID
```

**Check 2: Backend Logs**
```bash
# Terminal running backend
npm run dev:api
# Should show: "Client connected: socket-id (user: user-id)"
```

**Check 3: Database**
```bash
# Check if notifications are saved
mongosh
use quoreb2b_crm
db.notifications.find()
```

**Check 4: User Roles**
```bash
# Verify user has correct role
db.users.findOne({ email: "user@example.com" })
# Should show: roles: ["super_admin"] or ["db_admin"] or ["employee"]
```

### Notifications Sent to Wrong Users

- Verify `userId` is correct in notification call
- Check role-based filtering in `notification.service.ts`
- Verify user roles in database

### Socket Disconnects

- Check `SOCKET_CORS_ORIGINS` in backend `.env`
- Verify `NEXT_PUBLIC_SOCKET_URL` in frontend `.env.local`
- Check browser console for errors

---

## 📝 Code Template

Use this template when adding notifications to your modules:

```typescript
// 1. Import in module
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([...]),
    NotificationsModule, // Add this
  ],
})
export class YourModule {}

// 2. Inject in service
import { NotificationTriggerService } from '../notifications/notification-trigger.service';

@Injectable()
export class YourService {
  constructor(
    private notificationTriggerService: NotificationTriggerService,
    // ... other dependencies
  ) {}

  // 3. Add notification call
  async yourMethod(userId: string, data: any) {
    // Your business logic
    const result = await this.model.create(data);

    // Send notification
    await this.notificationTriggerService.notifyUser(userId, {
      title: 'Your Title',
      message: 'Your message',
      type: 'info',
      priority: 'medium',
      actionUrl: '/path',
      actionLabel: 'Action',
    });

    return result;
  }
}
```

---

## 📊 Notification Flow

```
User Action (Mark Attendance, Apply Leave, etc.)
    ↓
Service Method Called
    ↓
Business Logic Executed
    ↓
NotificationTriggerService Called
    ↓
Notification Saved to Database
    ↓
Socket.io Event Emitted
    ↓
Frontend Receives Event
    ↓
Zustand Store Updated
    ↓
Notification Bell Updated
    ↓
User Sees Notification
```

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] All modules have notification integration
- [ ] Tested all notification types
- [ ] Verified role-based filtering works
- [ ] Checked socket connection in production
- [ ] Verified notifications save to database
- [ ] Tested on multiple browsers
- [ ] Checked performance impact
- [ ] Monitored error logs

---

## 📞 Support

If notifications are not working:

1. Check browser console for errors
2. Check backend logs for errors
3. Verify socket connection
4. Verify user roles in database
5. Check notification database collection
6. Review integration guide: `NOTIFICATION_INTEGRATION_GUIDE.md`

---

**Status**: ✅ Ready for Implementation

**Next Step**: Follow the checklist above to integrate notifications into each module.
