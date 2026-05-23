# Attendance & Leave Management System - Setup Guide

## 🎯 What's New

### Employee Features
- ✅ Mark attendance (Present, Absent, Leave, Half-day)
- ✅ Check-in/Check-out time tracking
- ✅ Apply for leave (Sick, Casual, Earned, Unpaid)
- ✅ View personal attendance dashboard
- ✅ View leave balance

### DB Admin Features
- ✅ View team attendance
- ✅ Approve/Reject leave applications
- ✅ View leave management panel
- ✅ Team analytics and trends

### Super Admin Features
- ✅ Organization-wide attendance
- ✅ All leave applications
- ✅ Advanced filtering and search

## 🔧 Backend Setup

### 1. Add Modules to app.module.ts

```typescript
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';

@Module({
  imports: [
    // ... other modules
    AttendanceModule,
    LeaveModule,
  ],
})
export class AppModule {}
```

### 2. Backend Files Created

**Attendance Module** (Already created)
- `backend/src/modules/attendance/schemas/attendance.schema.ts`
- `backend/src/modules/attendance/dto/attendance.dto.ts`
- `backend/src/modules/attendance/attendance.service.ts`
- `backend/src/modules/attendance/attendance.controller.ts`
- `backend/src/modules/attendance/attendance.module.ts`

**Leave Module** (New)
- `backend/src/modules/leave/schemas/leave.schema.ts`
- `backend/src/modules/leave/dto/leave.dto.ts`
- `backend/src/modules/leave/leave.service.ts`
- `backend/src/modules/leave/leave.controller.ts`
- `backend/src/modules/leave/leave.module.ts`

### 3. API Endpoints

#### Attendance Endpoints
```
POST   /attendance/mark                    Mark attendance
GET    /attendance/records                 Fetch records
GET    /attendance/analytics/monthly       Monthly analytics
GET    /attendance/analytics/yearly        Yearly analytics
GET    /attendance/analytics/team          Team analytics
```

#### Leave Endpoints
```
POST   /leave/apply                        Apply for leave
GET    /leave/applications                 Get all applications
GET    /leave/my-leaves                    Get user's leaves
GET    /leave/balance/:year                Get leave balance
POST   /leave/:leaveId/approve             Approve leave
POST   /leave/:leaveId/reject              Reject leave
```

## 🎨 Frontend Setup

### 1. New Components Created

**Attendance Components**
- `EmployeeAttendanceDashboard.tsx` - Updated with mark attendance & leave buttons
- `MarkAttendanceModal.tsx` - Modal for marking attendance
- `LeaveApplicationModal.tsx` - Modal for applying leave
- `DbAdminAttendanceDashboard.tsx` - Updated with leave management tab
- `LeaveManagementPanel.tsx` - Panel for approving/rejecting leaves

### 2. Updated Components
- `EmployeeAttendanceDashboard.tsx` - Added action buttons
- `DbAdminAttendanceDashboard.tsx` - Added leave management tab
- `attendance.service.ts` - Fixed import path

### 3. Access Points

**Employee**
- Route: `/employee/attendance`
- Features:
  - View personal attendance
  - Mark attendance button
  - Apply for leave button
  - Monthly calendar view
  - Yearly trend

**DB Admin**
- Route: `/db-admin/attendance`
- Features:
  - Attendance tab: Team attendance table
  - Leaves tab: Leave applications management
  - Approve/Reject buttons
  - Team analytics

**Super Admin**
- Route: `/admin/attendance`
- Features:
  - Organization-wide attendance
  - All leave applications
  - Advanced filtering

## 📋 Mark Attendance Modal

### Features
- Date selection (past dates only)
- Status selection (Present, Absent, Leave, Half-day)
- Check-in/Check-out times (for Present status)
- Automatic hours calculation
- Optional notes
- Error handling
- Success confirmation

### Usage
```typescript
<MarkAttendanceModal
  isOpen={isOpen}
  onClose={handleClose}
  onSuccess={handleSuccess}
  userId={userId}
/>
```

## 📅 Leave Application Modal

### Features
- Leave type selection (Sick, Casual, Earned, Unpaid)
- Date range selection
- Automatic day calculation
- Reason field (required)
- Error handling
- Success confirmation

### Usage
```typescript
<LeaveApplicationModal
  isOpen={isOpen}
  onClose={handleClose}
  onSuccess={handleSuccess}
  userId={userId}
/>
```

## 🎯 Leave Management Panel

### Features
- Filter by status (Pending, Approved, Rejected, All)
- Employee information display
- Leave details (dates, days, reason)
- Approve button (for pending leaves)
- Reject button (for pending leaves)
- Status badges
- Leave type badges

### Usage
```typescript
<LeaveManagementPanel />
```

## 🔄 Data Flow

### Mark Attendance
```
Employee clicks "Mark Attendance"
    ↓
MarkAttendanceModal opens
    ↓
Employee fills form
    ↓
Submit to API: POST /attendance/mark
    ↓
Backend saves to MongoDB
    ↓
Success message shown
    ↓
Dashboard refreshes
```

### Apply Leave
```
Employee clicks "Apply for Leave"
    ↓
LeaveApplicationModal opens
    ↓
Employee fills form
    ↓
Submit to API: POST /leave/apply
    ↓
Backend saves to MongoDB
    ↓
Success message shown
    ↓
DB Admin sees in Leave Applications
```

### Approve Leave
```
DB Admin views Leave Applications
    ↓
Clicks "Approve" button
    ↓
Submit to API: POST /leave/:leaveId/approve
    ↓
Backend updates status to "approved"
    ↓
Status badge updates
    ↓
Buttons disappear
```

## 🎨 UI Components

### Modal Styling
- Clean white background
- Header with icon and title
- Form fields with labels
- Status/Type selection buttons
- Error messages (red)
- Success messages (green)
- Cancel and Submit buttons

### Dashboard Styling
- Metric cards with icons
- Color-coded status badges
- Progress bars for attendance %
- Data tables with hover effects
- Tab navigation
- Filter controls

## 🔐 Security

- ✅ JWT authentication required
- ✅ Role-based access control
- ✅ Employee can only mark own attendance
- ✅ DB Admin can only approve team leaves
- ✅ Super Admin can see all
- ✅ Input validation
- ✅ Date validation

## 📊 Database Schema

### Attendance Collection
```typescript
{
  userId: ObjectId,
  date: Date,
  status: 'present' | 'absent' | 'leave' | 'half-day',
  checkInTime?: Date,
  checkOutTime?: Date,
  hoursWorked: number,
  notes?: string,
  isApproved: boolean,
  approvedBy?: ObjectId,
  approvedAt?: Date,
  timestamps: { createdAt, updatedAt }
}
```

### Leave Collection
```typescript
{
  userId: ObjectId,
  leaveType: 'sick' | 'casual' | 'earned' | 'unpaid',
  startDate: Date,
  endDate: Date,
  numberOfDays: number,
  reason: string,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: ObjectId,
  approvalDate?: Date,
  rejectionReason?: string,
  timestamps: { createdAt, updatedAt }
}
```

## 🧪 Testing

### Employee Testing
1. Navigate to `/employee/attendance`
2. Click "Mark Attendance" button
3. Fill form and submit
4. Verify success message
5. Click "Apply for Leave" button
6. Fill form and submit
7. Verify success message

### DB Admin Testing
1. Navigate to `/db-admin/attendance`
2. View team attendance in "Attendance" tab
3. Click "Leave Applications" tab
4. View pending leave applications
5. Click "Approve" or "Reject"
6. Verify status updates

### Super Admin Testing
1. Navigate to `/admin/attendance`
2. View organization-wide attendance
3. View all leave applications
4. Test filtering and search

## 📝 File Listing

### Backend Files (10 total)
- Attendance: 5 files (already created)
- Leave: 5 files (new)

### Frontend Files (5 new)
- `MarkAttendanceModal.tsx`
- `LeaveApplicationModal.tsx`
- `LeaveManagementPanel.tsx`
- `EmployeeAttendanceDashboard.tsx` (updated)
- `DbAdminAttendanceDashboard.tsx` (updated)

### Updated Files (1)
- `attendance.service.ts` (fixed import)

## 🚀 Deployment Checklist

- [ ] Add AttendanceModule to app.module.ts
- [ ] Add LeaveModule to app.module.ts
- [ ] Restart backend server
- [ ] Test all API endpoints
- [ ] Test Employee dashboard
- [ ] Test DB Admin dashboard
- [ ] Test Super Admin dashboard
- [ ] Verify database indexes
- [ ] Test error handling
- [ ] Test success messages

## 💡 Tips

### For Employees
- Mark attendance daily
- Apply for leave in advance
- Check leave balance
- View attendance trends

### For DB Admins
- Review pending leave applications regularly
- Approve/Reject promptly
- Monitor team attendance
- Track leave usage

### For Super Admins
- Monitor organization-wide attendance
- Review all leave applications
- Generate reports
- Set policies

## 🆘 Troubleshooting

### Issue: Modal not opening
- Check if button click handler is working
- Verify state management
- Check console for errors

### Issue: Attendance not saving
- Verify API endpoint is correct
- Check JWT token is valid
- Verify database connection
- Check MongoDB indexes

### Issue: Leave not appearing
- Verify leave was submitted
- Check database for records
- Verify API response
- Check filter settings

## 📞 Support

For issues or questions:
1. Check this setup guide
2. Review API endpoints
3. Check database schema
4. Test with sample data
5. Check browser console for errors

---

**Status**: ✅ Ready for Deployment
**Version**: 2.0 (with Leave Management)
**Last Updated**: 2024
