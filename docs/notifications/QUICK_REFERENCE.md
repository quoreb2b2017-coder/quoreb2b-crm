# Notification System - Quick Reference

Fast reference for implementing notifications in your modules.

---

## 🚀 Quick Start (5 Minutes)

### 1. Import Module (30 seconds)

```typescript
// In your module file (e.g., attendance.module.ts)
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([...]),
    NotificationsModule, // ← Add this
  ],
})
export class AttendanceModule {}
```

### 2. Inject Service (30 seconds)

```typescript
// In your service file (e.g., attendance.service.ts)
import { NotificationTriggerService } from '../notifications/notification-trigger.service';

@Injectable()
export class AttendanceService {
  constructor(
    private notificationTriggerService: NotificationTriggerService,
    // ... other dependencies
  ) {}
}
```

### 3. Add Notification Call (1 minute)

```typescript
// In your method
async markAttendance(userId: string, data: MarkAttendanceDto) {
  const user = await this.userModel.findById(userId);
  const attendance = await this.model.create(data);

  // ← Add this
  await this.notificationTriggerService.notifyAttendanceMarked(
    userId,
    `${user.firstName} ${user.lastName}`,
    new Date(data.date).toLocaleDateString(),
    data.status,
  );

  return attendance;
}
```

### 4. Test (2 minutes)

- Mark attendance
- Check notification bell
- Should see notification ✅

---

## 📋 Common Patterns

### Pattern 1: Notify User on Action

```typescript
await this.notificationTriggerService.notifyUser(userId, {
  title: 'Action Title',
  message: 'Action message',
  type: 'success',
  priority: 'medium',
  actionUrl: '/path',
  actionLabel: 'View',
});
```

### Pattern 2: Notify All Super Admins

```typescript
await this.notificationTriggerService.notifySuperAdmins({
  title: 'Admin Title',
  message: 'Admin message',
  type: 'info',
  priority: 'high',
});
```

### Pattern 3: Notify All DB Admins

```typescript
await this.notificationTriggerService.notifyDbAdmins({
  title: 'DB Admin Title',
  message: 'DB Admin message',
  type: 'warning',
  priority: 'medium',
});
```

### Pattern 4: Notify All Users (System Alert)

```typescript
await this.notificationTriggerService.notifyAll({
  title: 'System Alert',
  message: 'System message',
  type: 'system_alert',
  priority: 'critical',
});
```

---

## 🎯 Pre-Built Methods

### Attendance
```typescript
notifyAttendanceMarked(userId, userName, date, status)
```

### Leave
```typescript
notifyLeaveApplied(userId, userName, leaveType, startDate, endDate)
notifyLeaveApproved(userId, userName, leaveType, startDate, endDate, approvedBy)
notifyLeaveRejected(userId, userName, leaveType, startDate, endDate, reason)
```

### Users
```typescript
notifyUserCreated(email, role)
notifyLogin(userId, userName)
```

### Batch
```typescript
notifyBatchCreated(batchName, createdBy)
notifyBatchUpdated(batchName, updatedBy)
notifyBatchDeleted(batchName, deletedBy)
```

### Data
```typescript
notifyDataUploaded(rowCount, uploadedBy)
notifySystemAlert(message, severity)
```

---

## 🔧 Module Integration Checklist

### Attendance Module
```typescript
// 1. Import
import { NotificationsModule } from '../notifications/notifications.module';

// 2. Add to imports
imports: [NotificationsModule]

// 3. Inject
constructor(private notificationTriggerService: NotificationTriggerService)

// 4. Use in markAttendance()
await this.notificationTriggerService.notifyAttendanceMarked(...)
```

### Leave Module
```typescript
// 1. Import
import { NotificationsModule } from '../notifications/notifications.module';

// 2. Add to imports
imports: [NotificationsModule]

// 3. Inject
constructor(private notificationTriggerService: NotificationTriggerService)

// 4. Use in applyLeave()
await this.notificationTriggerService.notifyLeaveApplied(...)

// 5. Use in approveLeave()
await this.notificationTriggerService.notifyLeaveApproved(...)

// 6. Use in rejectLeave()
await this.notificationTriggerService.notifyLeaveRejected(...)
```

### Users Module
```typescript
// 1. Import
import { NotificationsModule } from '../notifications/notifications.module';

// 2. Add to imports
imports: [NotificationsModule]

// 3. Inject
constructor(private notificationTriggerService: NotificationTriggerService)

// 4. Use in createUser()
await this.notificationTriggerService.notifyUserCreated(...)
```

---

## 🧪 Quick Test

### Test Super Admin Notifications
1. Login as Super Admin
2. Mark attendance
3. Check notification bell
4. Should see notification ✅

### Test DB Admin Notifications
1. Login as DB Admin
2. Apply for leave
3. Check notification bell
4. Should see notification ✅

### Test Employee Notifications
1. Login as Employee
2. Mark attendance
3. Check notification bell
4. Should see notification ✅

---

## 🐛 Quick Troubleshooting

### Notifications Not Showing?

**Check 1: Socket Connected?**
```javascript
// Browser console
socket.connected  // Should be true
```

**Check 2: User Role Correct?**
```bash
# MongoDB
db.users.findOne({ email: "user@example.com" })
# Should have roles: ["super_admin"] or ["db_admin"] or ["employee"]
```

**Check 3: Notification Saved?**
```bash
# MongoDB
db.notifications.find()
# Should show saved notifications
```

**Check 4: Backend Logs?**
```bash
# Terminal
npm run dev:api
# Should show: "Client connected: socket-id (user: user-id)"
```

---

## 📊 Notification Priority

| Priority | Use Case |
|----------|----------|
| low | General information |
| medium | Important updates |
| high | Urgent actions |
| critical | System alerts |

---

## 🎨 Notification Types

| Type | Icon | Use Case |
|------|------|----------|
| success | ✓ | Operation successful |
| error | ✕ | Operation failed |
| warning | ⚠️ | Warning message |
| info | ℹ️ | Information |
| batch_created | 📦 | Batch created |
| batch_updated | ✏️ | Batch updated |
| data_uploaded | 📤 | Data uploaded |
| user_added | 👤 | User added |
| system_alert | 🔔 | System alert |

---

## 📁 Files to Modify

### Attendance Module
- [ ] `backend/src/modules/attendance/attendance.module.ts` - Add import
- [ ] `backend/src/modules/attendance/attendance.service.ts` - Add injection & call

### Leave Module
- [ ] `backend/src/modules/leave/leave.module.ts` - Add import
- [ ] `backend/src/modules/leave/leave.service.ts` - Add injection & calls

### Users Module
- [ ] `backend/src/modules/users/users.module.ts` - Add import
- [ ] `backend/src/modules/users/users.service.ts` - Add injection & call

### Batch Module (if exists)
- [ ] `backend/src/modules/batch/batch.module.ts` - Add import
- [ ] `backend/src/modules/batch/batch.service.ts` - Add injection & calls

---

## 🚀 Deployment Steps

1. **Integrate all modules** (follow checklist above)
2. **Test locally** (mark attendance, apply leave, etc.)
3. **Verify socket connection** (browser console)
4. **Check database** (MongoDB notifications collection)
5. **Deploy to production**
6. **Monitor logs** (check for errors)

---

## 📞 Need Help?

- **Full Guide**: `docs/notifications/NOTIFICATION_INTEGRATION_GUIDE.md`
- **Checklist**: `docs/notifications/NOTIFICATION_IMPLEMENTATION_CHECKLIST.md`
- **Summary**: `docs/notifications/NOTIFICATION_SYSTEM_FIX_SUMMARY.md`

---

## ✅ Status

**Ready to Implement**: Yes ✅

**Time to Integrate**: ~30 minutes per module

**Complexity**: Low (copy-paste friendly)

---

**Let's get notifications working!** 🎉
