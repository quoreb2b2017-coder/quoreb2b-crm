# Attendance Management System - Quick Setup

## Backend Setup

### 1. Register Attendance Module
Add to `backend/src/app.module.ts`:

```typescript
import { AttendanceModule } from './modules/attendance/attendance.module';

@Module({
  imports: [
    // ... other modules
    AttendanceModule,
  ],
})
export class AppModule {}
```

### 2. Files Created
- `backend/src/modules/attendance/schemas/attendance.schema.ts` - Database schema
- `backend/src/modules/attendance/dto/attendance.dto.ts` - Data transfer objects
- `backend/src/modules/attendance/attendance.service.ts` - Business logic
- `backend/src/modules/attendance/attendance.controller.ts` - API endpoints
- `backend/src/modules/attendance/attendance.module.ts` - Module definition

### 3. Database Indexes
Automatically created:
- `userId + date` (unique)
- `userId + date` (descending)
- `date`

## Frontend Setup

### 1. Attendance Pages
- `/admin/attendance` - Super Admin dashboard
- `/db-admin/attendance` - DB Admin dashboard
- `/employee/attendance` - Employee dashboard

### 2. Navigation Updates
- Super Admin: Added "Attendance" to admin sidebar
- DB Admin: Created `db-admin-nav.ts` with attendance link
- Employee: Created `employee-nav.ts` with attendance link

### 3. Components Created
- `EmployeeAttendanceDashboard` - Personal attendance view
- `DbAdminAttendanceDashboard` - Team attendance view
- `SuperAdminAttendanceDashboard` - Organization attendance view

### 4. API Service
- `src/lib/api/attendance.service.ts` - Frontend API client

## Features

### Employee Dashboard
✅ Daily attendance calendar
✅ Monthly statistics (Present, Absent, Leave, Half-day)
✅ Attendance percentage calculation
✅ Yearly trend visualization
✅ Month/year filtering

### DB Admin Dashboard
✅ Team overview statistics
✅ Team member attendance table
✅ Search and filter by name/email
✅ Individual member details
✅ Yearly trend for selected member

### Super Admin Dashboard
✅ Organization-wide statistics
✅ All users table with attendance
✅ Advanced search and filtering
✅ Role-based filtering
✅ Individual user details
✅ Yearly trend visualization

## API Endpoints

### Mark Attendance
```bash
POST /attendance/mark
{
  "userId": "user_id",
  "date": "2024-01-15",
  "status": "present",
  "hoursWorked": 8
}
```

### Get Monthly Analytics
```bash
GET /attendance/analytics/monthly?userId=xxx&month=1&year=2024
```

### Get Yearly Analytics
```bash
GET /attendance/analytics/yearly?userId=xxx&year=2024
```

### Get Team Analytics
```bash
GET /attendance/analytics/team?userIds=xxx,yyy,zzz&month=1&year=2024
```

### Get Records
```bash
GET /attendance/records?userId=xxx&startDate=2024-01-01&endDate=2024-01-31&page=1&limit=50
```

## Color Scheme

| Status | Color | Hex |
|--------|-------|-----|
| Present | Green | #10b981 |
| Absent | Red | #ef4444 |
| Leave | Blue | #3b82f6 |
| Half-Day | Yellow | #eab308 |

## Testing

### 1. Employee View
- Navigate to `/employee/attendance`
- Should see personal attendance dashboard
- Select different months to filter data
- View yearly trend

### 2. DB Admin View
- Navigate to `/db-admin/attendance`
- Should see team overview
- Search for team members
- Click "View" to see individual details

### 3. Super Admin View
- Navigate to `/admin/attendance`
- Should see organization-wide attendance
- Use search and role filters
- Click "View" to see individual details

## Data Structure

### Monthly Analytics Response
```json
{
  "totalDays": 30,
  "presentDays": 22,
  "absentDays": 5,
  "leaveDays": 2,
  "halfDays": 1,
  "attendancePercentage": 80,
  "totalHoursWorked": 176,
  "dailyBreakdown": [
    {
      "date": "2024-01-01",
      "status": "present",
      "hoursWorked": 8
    }
  ]
}
```

### Yearly Analytics Response
```json
[
  {
    "month": "Jan",
    "presentDays": 22,
    "absentDays": 5,
    "leaveDays": 2,
    "halfDays": 1,
    "attendancePercentage": 80
  }
]
```

## Next Steps

1. ✅ Backend module created and ready to integrate
2. ✅ Frontend components created and ready to use
3. ✅ Navigation updated for all roles
4. ✅ API service created
5. 📋 TODO: Integrate with actual user data
6. 📋 TODO: Add attendance marking functionality
7. 📋 TODO: Add approval workflow
8. 📋 TODO: Add bulk import feature

## File Locations

### Backend
- Schema: `backend/src/modules/attendance/schemas/attendance.schema.ts`
- Service: `backend/src/modules/attendance/attendance.service.ts`
- Controller: `backend/src/modules/attendance/attendance.controller.ts`
- Module: `backend/src/modules/attendance/attendance.module.ts`
- DTOs: `backend/src/modules/attendance/dto/attendance.dto.ts`

### Frontend
- Employee Dashboard: `frontend/crm-frontend/src/components/attendance/EmployeeAttendanceDashboard.tsx`
- DB Admin Dashboard: `frontend/crm-frontend/src/components/attendance/DbAdminAttendanceDashboard.tsx`
- Super Admin Dashboard: `frontend/crm-frontend/src/components/attendance/SuperAdminAttendanceDashboard.tsx`
- API Service: `frontend/crm-frontend/src/lib/api/attendance.service.ts`
- Employee Page: `frontend/crm-frontend/src/app/(protected)/employee/attendance/page.tsx`
- DB Admin Page: `frontend/crm-frontend/src/app/(protected)/db-admin/attendance/page.tsx`
- Super Admin Page: `frontend/crm-frontend/src/app/(protected)/admin/attendance/page.tsx`

## Support

For issues or questions, refer to `ATTENDANCE_SYSTEM.md` for detailed documentation.
