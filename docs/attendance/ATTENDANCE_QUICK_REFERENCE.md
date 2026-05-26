# Attendance System - Quick Reference Guide

## 🎯 What's New

### 1. Weekend Auto-Marking
- **What**: Saturday & Sunday automatically marked as 'weekend'
- **Where**: MarkAttendanceModal shows weekend indicator
- **Why**: Accurate attendance tracking without manual marking

### 2. Paid Leave Support
- **What**: Checkbox to mark leave as paid or unpaid
- **Where**: MarkAttendanceModal when status = 'leave'
- **Why**: Differentiate between paid and unpaid leaves

### 3. Holiday Tracking Component
- **What**: New component to view leave history
- **Where**: Can be added to attendance pages
- **Shows**: Month-wise and yearly leave breakdown

---

## 📍 Component Locations

### Frontend Components
```
src/components/attendance/
├── MarkAttendanceModal.tsx (UPDATED)
│   └── Now shows weekend indicator
│   └── Paid leave checkbox for leaves
│
└── HolidayTracking.tsx (NEW)
    └── Month-wise leave breakdown
    └── Yearly summary
    └── User selection (admin)
```

### Backend Services
```
backend/src/modules/attendance/
├── attendance.service.ts (UPDATED)
│   └── Weekend detection
│   └── Paid leave tracking
│
├── attendance-date.util.ts (UPDATED)
│   └── isWeekend() function
│
├── dto/attendance.dto.ts (UPDATED)
│   └── isPaidLeave field
│
└── schemas/attendance.schema.ts (UPDATED)
    └── isPaidLeave field
    └── weekend status
```

---

## 🔧 Integration Steps

### 1. Add HolidayTracking to a Page
```tsx
import { HolidayTracking } from '@/components/attendance/HolidayTracking';

export function AttendancePage() {
  return (
    <div>
      <HolidayTracking 
        userId={currentUserId}
        variant="employee"
      />
    </div>
  );
}
```

### 2. For Admin View
```tsx
<HolidayTracking 
  variant="admin"
  // userId not needed - admin can select
/>
```

### 3. For Employee View
```tsx
<HolidayTracking 
  userId={employeeId}
  variant="employee"
/>
```

---

## 📊 Data Structure

### Attendance Record
```typescript
{
  _id: string;
  userId: string;
  date: string;
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'weekend';
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked: number;
  notes?: string;
  isPaidLeave?: boolean;  // NEW
  isApproved: boolean;
}
```

### Analytics Response
```typescript
{
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  paidLeaveDays: number;  // NEW
  halfDays: number;
  weekendDays: number;    // NEW
  attendancePercentage: number;
  totalHoursWorked: number;
  dailyBreakdown: Array<{
    date: string;
    status: string;
    hoursWorked: number;
    isPaidLeave?: boolean; // NEW
  }>;
}
```

---

## 🎨 UI Features

### MarkAttendanceModal
- ✅ Weekend indicator (shows when date is Sat/Sun)
- ✅ Paid leave checkbox (only for leave status)
- ✅ Auto-detection of weekend dates
- ✅ Dark mode support

### HolidayTracking
- ✅ Year selector (2022-2026)
- ✅ User selector (admin only)
- ✅ Summary cards (Total/Paid/Unpaid leaves)
- ✅ Month-wise breakdown (12 cards)
- ✅ Attendance percentage per month
- ✅ Progress bars
- ✅ Dark mode support

---

## 🔍 Key Functions

### Backend
```typescript
// Check if day is weekend
isWeekend(dayOfWeek: number): boolean
// Returns true for Saturday (6) and Sunday (0)

// Get yearly analytics
getYearlyAttendanceAnalytics(userId: string, year?: number)
// Returns array of 12 months with leave breakdown

// Get monthly analytics
getAttendanceAnalytics(dto: AttendanceAnalyticsDto)
// Returns detailed monthly analytics with daily breakdown
```

### Frontend
```typescript
// Mark attendance with paid leave
attendanceService.markAttendance(
  userId,
  date,
  status,
  hoursWorked,
  notes,
  times,
  isPaidLeave  // NEW parameter
)

// Get yearly analytics
attendanceService.getYearlyAnalytics(userId, year)
// Returns YearlyAnalytics[] for all 12 months
```

---

## 📈 Calculations

### Attendance Percentage
```
Working Days = Total Days - Weekend Days
Attendance % = (Present Days + Half Days * 0.5) / Working Days * 100
```

### Leave Breakdown
```
Total Leaves = Paid Leaves + Unpaid Leaves
```

---

## 🧪 Testing Scenarios

### Scenario 1: Weekend Marking
1. Open Mark Attendance
2. Select Saturday or Sunday
3. ✅ Should show "Weekend - Auto-marked"
4. ✅ Status should be 'weekend'

### Scenario 2: Paid Leave
1. Open Mark Attendance
2. Select date
3. Choose "Leave" status
4. ✅ Paid leave checkbox should appear
5. Check it and save
6. ✅ Should be marked as paid leave

### Scenario 3: View Leave History
1. Open Holiday Tracking
2. Select year
3. ✅ Should show 12 month cards
4. ✅ Each card shows leave breakdown
5. ✅ Summary cards show totals

### Scenario 4: Admin View
1. Open Holiday Tracking (admin)
2. Select employee from dropdown
3. Select year
4. ✅ Should show that employee's data

---

## 🚀 Deployment Checklist

- [ ] Backend migrations run (if needed)
- [ ] New fields added to database
- [ ] Frontend components deployed
- [ ] HolidayTracking integrated into pages
- [ ] MarkAttendanceModal updated
- [ ] Tested weekend detection
- [ ] Tested paid leave marking
- [ ] Tested leave history viewing
- [ ] Tested admin user selection
- [ ] Dark mode verified
- [ ] Mobile responsive verified

---

## 📞 Support

### Common Issues

**Q: Weekend not auto-marking?**
A: Check that date is actually Saturday (6) or Sunday (0). Verify `isWeekend()` function is called.

**Q: Paid leave checkbox not showing?**
A: Only shows when status = 'leave'. Check status selection.

**Q: Leave history not loading?**
A: Verify userId is provided. Check network requests in browser console.

**Q: Attendance % incorrect?**
A: Verify weekend days are being counted. Check calculation formula.

---

## 📚 Related Files

- Frontend Service: `src/lib/api/attendance.service.ts`
- Backend Service: `backend/src/modules/attendance/attendance.service.ts`
- Mark Modal: `src/components/attendance/MarkAttendanceModal.tsx`
- Holiday Tracking: `src/components/attendance/HolidayTracking.tsx`
- Date Utils: `backend/src/modules/attendance/attendance-date.util.ts`

---

**All done! 🎉**
