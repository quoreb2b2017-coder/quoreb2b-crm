# Attendance Management System

Complete attendance tracking system with role-based dashboards for Super Admin, DB Admin, and Employee roles.

## Features

### Employee Dashboard
- **Daily Attendance View**: Calendar-based daily breakdown with status indicators
- **Monthly Analytics**: Present, Absent, Leave, Half-day counts
- **Attendance Percentage**: Real-time calculation of monthly attendance %
- **Yearly Trend**: Month-by-month attendance visualization with progress bars
- **Month/Year Selection**: Filter attendance data by specific month and year

### DB Admin Dashboard
- **Team Overview**: Total team members, average attendance, total present/absent
- **Team Attendance Table**: Sortable table with all team members' attendance stats
- **Individual Details**: Click to view detailed yearly trend for any team member
- **Search & Filter**: Search by name/email, filter by role
- **Monthly Analytics**: Team-wide attendance metrics

### Super Admin Dashboard
- **Organization-Wide View**: All users across all roles
- **Advanced Filtering**: Search by name/email, filter by role (Super Admin, DB Admin, Employee)
- **Comprehensive Analytics**: Organization-wide attendance statistics
- **Individual User Details**: Detailed yearly trend for any user
- **Role-Based Insights**: View attendance patterns by role

## Backend Implementation

### Database Schema
```typescript
// Attendance Document
{
  userId: ObjectId,           // Reference to User
  date: Date,                 // Attendance date
  status: 'present' | 'absent' | 'leave' | 'half-day',
  checkInTime?: Date,         // Optional check-in time
  checkOutTime?: Date,        // Optional check-out time
  hoursWorked: number,        // Hours worked (default: 0)
  notes?: string,             // Optional notes
  isApproved: boolean,        // Approval status
  approvedBy?: ObjectId,      // Approver reference
  approvedAt?: Date,          // Approval timestamp
  createdAt: Date,            // Created timestamp
  updatedAt: Date             // Updated timestamp
}
```

### API Endpoints

#### Mark Attendance
```
POST /attendance/mark
Body: {
  userId: string,
  date: Date,
  status: 'present' | 'absent' | 'leave' | 'half-day',
  checkInTime?: Date,
  checkOutTime?: Date,
  hoursWorked?: number,
  notes?: string
}
```

#### Get Attendance Records
```
GET /attendance/records?userId=xxx&startDate=xxx&endDate=xxx&page=1&limit=50
Response: {
  records: Attendance[],
  total: number,
  page: number,
  limit: number,
  pages: number
}
```

#### Get Monthly Analytics
```
GET /attendance/analytics/monthly?userId=xxx&month=1&year=2024
Response: {
  totalDays: number,
  presentDays: number,
  absentDays: number,
  leaveDays: number,
  halfDays: number,
  attendancePercentage: number,
  totalHoursWorked: number,
  dailyBreakdown: Array<{
    date: string,
    status: string,
    hoursWorked: number
  }>
}
```

#### Get Yearly Analytics
```
GET /attendance/analytics/yearly?userId=xxx&year=2024
Response: Array<{
  month: string,
  presentDays: number,
  absentDays: number,
  leaveDays: number,
  halfDays: number,
  attendancePercentage: number
}>
```

#### Get Team Analytics
```
GET /attendance/analytics/team?userIds=xxx,yyy,zzz&month=1&year=2024
Response: Array<{
  userId: string,
  presentDays: number,
  absentDays: number,
  leaveDays: number,
  halfDays: number,
  attendancePercentage: number
}>
```

## Frontend Components

### EmployeeAttendanceDashboard
- Location: `src/components/attendance/EmployeeAttendanceDashboard.tsx`
- Shows personal attendance with monthly and yearly views
- Features: Month/year selector, daily calendar, yearly trend chart

### DbAdminAttendanceDashboard
- Location: `src/components/attendance/DbAdminAttendanceDashboard.tsx`
- Shows team attendance with filtering and search
- Features: Team overview, member table, individual details, yearly trend

### SuperAdminAttendanceDashboard
- Location: `src/components/attendance/SuperAdminAttendanceDashboard.tsx`
- Shows organization-wide attendance
- Features: Advanced search/filter, all users table, individual details, yearly trend

## Pages

### Employee Attendance Page
- Route: `/employee/attendance`
- Component: `EmployeeAttendanceDashboard`
- File: `src/app/(protected)/employee/attendance/page.tsx`

### DB Admin Attendance Page
- Route: `/db-admin/attendance`
- Component: `DbAdminAttendanceDashboard`
- File: `src/app/(protected)/db-admin/attendance/page.tsx`

### Super Admin Attendance Page
- Route: `/admin/attendance`
- Component: `SuperAdminAttendanceDashboard`
- File: `src/app/(protected)/admin/attendance/page.tsx`

## Navigation Integration

### Super Admin Navigation
- Added "Attendance" link to admin sidebar
- File: `src/components/admin/admin-nav.ts`

### DB Admin Navigation
- Created DB Admin navigation with "Attendance" link
- File: `src/components/db-admin/db-admin-nav.ts`

### Employee Navigation
- Created Employee navigation with "Attendance" link
- File: `src/components/employee/employee-nav.ts`

## API Service

### attendanceService
- Location: `src/lib/api/attendance.service.ts`
- Methods:
  - `markAttendance(userId, date, status, hoursWorked)`: Mark attendance
  - `getRecords(userId, startDate, endDate, page, limit)`: Fetch records
  - `getMonthlyAnalytics(userId, month, year)`: Get monthly stats
  - `getYearlyAnalytics(userId, year)`: Get yearly stats
  - `getTeamAnalytics(userIds, month, year)`: Get team stats

## Color Coding

- **Present**: Green (#10b981)
- **Absent**: Red (#ef4444)
- **Leave**: Blue (#3b82f6)
- **Half-Day**: Yellow (#eab308)

## Attendance Calculation

### Monthly Attendance %
```
Attendance % = ((Present Days + Half-Day * 0.5) / Total Days) * 100
```

### Yearly Trend
- Shows monthly breakdown with attendance percentage
- Displays present and absent days for each month
- Visual progress bar for quick assessment

## Features Breakdown

### Employee View
- Personal attendance tracking
- Monthly calendar with daily status
- Yearly trend visualization
- Month/year filtering

### DB Admin View
- Team member overview
- Individual member details
- Search and filter capabilities
- Yearly trend for selected member
- Team-wide statistics

### Super Admin View
- Organization-wide attendance
- All users across all roles
- Advanced search and filtering
- Role-based filtering
- Individual user details
- Comprehensive analytics

## Integration Points

### Backend Module
- File: `backend/src/modules/attendance/`
- Includes: Schema, Service, Controller, DTOs
- Exports: AttendanceModule

### Frontend Integration
- Attendance pages added to all role dashboards
- Navigation updated for all roles
- API service created for attendance operations
- Components styled with Tailwind CSS

## Usage

### For Employees
1. Navigate to `/employee/attendance`
2. View personal attendance dashboard
3. Select month/year to filter data
4. See daily breakdown and yearly trend

### For DB Admins
1. Navigate to `/db-admin/attendance`
2. View team attendance overview
3. Search/filter team members
4. Click "View" to see individual details
5. Analyze yearly trends

### For Super Admins
1. Navigate to `/admin/attendance`
2. View organization-wide attendance
3. Use search and role filters
4. Click "View" to see individual details
5. Analyze trends across all users

## Future Enhancements

- Attendance approval workflow
- Bulk attendance import
- Attendance reports export (PDF/Excel)
- Automated attendance reminders
- Geolocation-based check-in
- Mobile app integration
- Attendance policy enforcement
- Leave management integration
- Shift-based attendance
- Biometric integration
