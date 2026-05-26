# Attendance Management System Documentation

Complete documentation for the attendance and leave management system.

## Quick Links

- **[Attendance System](ATTENDANCE_SYSTEM.md)** - Core attendance tracking features
- **[Attendance Setup](ATTENDANCE_SETUP.md)** - Setup and configuration guide
- **[Leave Management](ATTENDANCE_LEAVE_COMPLETE.md)** - Leave application workflow
- **[Architecture](ATTENDANCE_ARCHITECTURE.md)** - System architecture and design
- **[Implementation](ATTENDANCE_IMPLEMENTATION.md)** - Implementation details
- **[Quick Reference](ATTENDANCE_QUICK_REFERENCE.md)** - Quick reference guide

## Key Features

✅ Monthly/yearly analytics with daily breakdown
✅ Role-based dashboards (Super Admin, DB Admin, Employee)
✅ Mark attendance with date, status, check-in/check-out times
✅ Apply for leave with type, date range, reason
✅ Leave approval/rejection system
✅ Leave balance tracking
✅ Auto-open modals via URL parameters

## Attendance Calculation

```
Attendance % = ((Present Days + Half-Day * 0.5) / Total Days) * 100
```

## Database Schema

### Attendance Collection
- userId (indexed)
- date (indexed)
- status: 'present' | 'absent' | 'half-day'
- checkInTime, checkOutTime
- hoursWorked
- approvalStatus: 'pending' | 'approved' | 'rejected'

### Leave Collection
- userId
- leaveType
- startDate, endDate
- numberOfDays
- reason
- status: 'pending' | 'approved' | 'rejected'

## File Structure

```
backend/src/modules/
├── attendance/
│   ├── schemas/attendance.schema.ts
│   ├── dto/attendance.dto.ts
│   ├── attendance.service.ts
│   ├── attendance.controller.ts
│   └── attendance.module.ts
└── leave/
    ├── schemas/leave.schema.ts
    ├── dto/leave.dto.ts
    ├── leave.service.ts
    ├── leave.controller.ts
    └── leave.module.ts

frontend/crm-frontend/src/
├── components/attendance/
│   ├── EmployeeAttendanceDashboard.tsx
│   ├── DbAdminAttendanceDashboard.tsx
│   ├── SuperAdminAttendanceDashboard.tsx
│   ├── AttendanceDetailsPage.tsx
│   ├── MarkAttendanceModal.tsx
│   ├── LeaveApplicationModal.tsx
│   └── LeaveManagementPanel.tsx
└── lib/api/attendance.service.ts
```

## API Endpoints

### Attendance
- `POST /api/v1/attendance/mark` - Mark attendance
- `GET /api/v1/attendance/records` - Get attendance records
- `GET /api/v1/attendance/analytics` - Get monthly analytics
- `GET /api/v1/attendance/team-analytics` - Get team analytics
- `GET /api/v1/attendance/yearly-analytics` - Get yearly analytics

### Leave
- `POST /api/v1/leave/apply` - Apply for leave
- `GET /api/v1/leave/applications` - Get leave applications
- `POST /api/v1/leave/approve` - Approve leave
- `POST /api/v1/leave/reject` - Reject leave
- `GET /api/v1/leave/balance` - Get leave balance

## Role-Based Access

- **Super Admin**: View all users' attendance, organization-wide analytics
- **DB Admin**: View team members' attendance, manage leave applications
- **Employee**: Personal attendance tracking, mark attendance, apply for leave
