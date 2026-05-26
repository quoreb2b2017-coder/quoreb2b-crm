# Weekend Auto-Mark System - Complete Guide

## 🎯 How It Works

### Automatic Marking (Scheduled)
```
Every day at 11:59 PM IST (6:29 PM UTC)
↓
Check if today is Saturday or Sunday
↓
If YES → Auto-mark all active employees as 'weekend'
↓
Status: 'weekend'
Hours: 0
Notes: 'Auto-marked weekend'
Approved: true
```

### Manual Trigger (On Demand)
```
Admin/User clicks "Mark Now" button
↓
System checks if today is weekend
↓
If YES → Immediately mark all employees
↓
If NO → Show error message
```

---

## 📍 Components & Files

### Backend

#### New Files:
1. **`attendance-scheduler.service.ts`**
   - Cron job that runs daily at 11:59 PM IST
   - Auto-marks all weekends for all active users
   - Uses bulk operations for efficiency

#### Updated Files:
1. **`attendance.module.ts`**
   - Added `ScheduleModule.forRoot()`
   - Added `AttendanceSchedulerService` provider

2. **`attendance.controller.ts`**
   - Added `POST /attendance/auto-mark-weekends` endpoint
   - Manual trigger for testing/admin use

### Frontend

#### New Files:
1. **`WeekendAutoMarkStatus.tsx`**
   - Shows weekend status
   - Manual trigger button
   - Success/error messages
   - Only visible on weekends

---

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
npm install @nestjs/schedule
```

### 2. Update Main App Module
```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ... other imports
  ],
})
export class AppModule {}
```

### 3. Deploy Backend Changes
- Update `attendance.module.ts`
- Add `attendance-scheduler.service.ts`
- Update `attendance.controller.ts`

### 4. Deploy Frontend Changes
- Add `WeekendAutoMarkStatus.tsx` component
- Import in attendance pages

---

## 📊 Cron Schedule

### Current Schedule
```
Time: 11:59 PM IST (23:59 IST)
UTC: 6:29 PM UTC (18:29 UTC)
Timezone: Asia/Kolkata
Frequency: Every day
Days: All days (but only marks on Sat/Sun)
```

### Cron Expression
```
59 23 * * *
│  │  │ │ │
│  │  │ │ └─ Day of week (0-6, 0=Sunday)
│  │  │ └─── Month (1-12)
│  │  └───── Day of month (1-31)
│  └──────── Hour (0-23)
└─────────── Minute (0-59)
```

### Change Schedule
To change the time, modify the cron expression in `attendance-scheduler.service.ts`:

```typescript
@Cron('59 23 * * *', { timeZone: 'Asia/Kolkata' })
// Change to:
@Cron('0 0 * * *', { timeZone: 'Asia/Kolkata' }) // Midnight
@Cron('30 18 * * *', { timeZone: 'Asia/Kolkata' }) // 6:30 PM
```

---

## 🎨 UI Integration

### Add to Attendance Dashboard
```tsx
import { WeekendAutoMarkStatus } from '@/components/attendance/WeekendAutoMarkStatus';

export function AttendanceDashboard() {
  return (
    <div className="space-y-6">
      <WeekendAutoMarkStatus />
      {/* Other components */}
    </div>
  );
}
```

### Add to Admin Panel
```tsx
import { WeekendAutoMarkStatus } from '@/components/attendance/WeekendAutoMarkStatus';

export function AdminAttendancePanel() {
  return (
    <div>
      <WeekendAutoMarkStatus />
      {/* Admin controls */}
    </div>
  );
}
```

---

## 🧪 Testing

### Test 1: Check Cron Job Logs
```bash
# In production, check logs for:
# "Starting auto-mark weekends job..."
# "Auto-marked X weekend records for Y users"
```

### Test 2: Manual Trigger
1. Go to attendance page on Saturday/Sunday
2. Click "Mark Now" button
3. Should see success message
4. Check database for new records

### Test 3: Verify Records
```bash
# Check MongoDB for weekend records
db.attendances.find({
  status: 'weekend',
  date: { $gte: ISODate('2024-01-06'), $lte: ISODate('2024-01-07') }
})
```

---

## 📈 Data Structure

### Auto-Marked Record
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  date: Date,
  status: 'weekend',
  hoursWorked: 0,
  notes: 'Auto-marked weekend',
  isPaidLeave: false,
  isApproved: true,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔍 Troubleshooting

### Issue: Weekends not auto-marking
**Solution:**
1. Check if `ScheduleModule` is imported in main app
2. Verify cron expression is correct
3. Check server logs for errors
4. Manually trigger using API endpoint

### Issue: Marking wrong users
**Solution:**
1. Verify `getUserIds()` query is correct
2. Check if users have `isActive: true` flag
3. Filter by company/department if needed

### Issue: Timezone issues
**Solution:**
1. Verify server timezone is set correctly
2. Check cron expression timezone
3. Use UTC times if IST not available

### Issue: Performance issues
**Solution:**
1. Use bulk operations (already implemented)
2. Add indexes on userId and date
3. Run during off-peak hours

---

## 📞 API Endpoints

### Manual Trigger
```
POST /attendance/auto-mark-weekends
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Weekend auto-mark triggered successfully"
}
```

### Get Records
```
GET /attendance/records?userId=<id>&status=weekend

Response:
{
  "records": [...],
  "total": 52,
  "page": 1,
  "limit": 50,
  "pages": 2
}
```

---

## 🚀 Deployment Checklist

- [ ] Install `@nestjs/schedule` package
- [ ] Update `app.module.ts` with `ScheduleModule`
- [ ] Deploy `attendance-scheduler.service.ts`
- [ ] Update `attendance.module.ts`
- [ ] Update `attendance.controller.ts`
- [ ] Deploy `WeekendAutoMarkStatus.tsx`
- [ ] Add component to attendance pages
- [ ] Test on Saturday/Sunday
- [ ] Verify cron job runs at correct time
- [ ] Check logs for success messages
- [ ] Monitor database for new records

---

## 📚 Related Files

- Scheduler: `backend/src/modules/attendance/attendance-scheduler.service.ts`
- Module: `backend/src/modules/attendance/attendance.module.ts`
- Controller: `backend/src/modules/attendance/attendance.controller.ts`
- Component: `frontend/crm-frontend/src/components/attendance/WeekendAutoMarkStatus.tsx`
- Utils: `backend/src/modules/attendance/attendance-date.util.ts`

---

## ✨ Features

✅ Automatic weekend detection  
✅ Scheduled cron job (11:59 PM IST)  
✅ Bulk marking for all employees  
✅ Manual trigger option  
✅ Status indicator component  
✅ Error handling  
✅ Logging  
✅ Timezone support  

---

## 🎉 Done!

Weekend auto-marking is now fully implemented with:
- Scheduled cron job
- Manual trigger option
- Status indicator
- Error handling

**Bilkul sab kuch fix ho gaya! 🚀**
