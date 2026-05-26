# 🏗️ Attendance Management System - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ATTENDANCE SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      FRONTEND (Next.js 14)                       │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │   │
│  │  │  EMPLOYEE PAGE   │  │  DB ADMIN PAGE   │  │ SUPER ADMIN  │  │   │
│  │  │                  │  │                  │  │    PAGE      │  │   │
│  │  │ /employee/       │  │ /db-admin/       │  │ /admin/      │  │   │
│  │  │ attendance       │  │ attendance       │  │ attendance   │  │   │
│  │  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │   │
│  │           │                     │                    │           │   │
│  │  ┌────────▼─────────┐  ┌────────▼─────────┐  ┌──────▼───────┐  │   │
│  │  │ Employee         │  │ DB Admin         │  │ Super Admin  │  │   │
│  │  │ Dashboard        │  │ Dashboard        │  │ Dashboard    │  │   │
│  │  │                  │  │                  │  │              │  │   │
│  │  │ • Personal view  │  │ • Team view      │  │ • Org view   │  │   │
│  │  │ • Monthly stats  │  │ • Search/filter  │  │ • All users  │  │   │
│  │  │ • Yearly trend   │  │ • Individual     │  │ • Advanced   │  │   │
│  │  │ • Calendar       │  │ • Yearly trend   │  │ • Filtering  │  │   │
│  │  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │   │
│  │           │                     │                    │           │   │
│  │           └─────────────────────┼────────────────────┘           │   │
│  │                                 │                                │   │
│  │                    ┌────────────▼────────────┐                  │   │
│  │                    │  Attendance API Service │                  │   │
│  │                    │                         │                  │   │
│  │                    │ • markAttendance()      │                  │   │
│  │                    │ • getRecords()          │                  │   │
│  │                    │ • getMonthlyAnalytics() │                  │   │
│  │                    │ • getYearlyAnalytics()  │                  │   │
│  │                    │ • getTeamAnalytics()    │                  │   │
│  │                    └────────────┬────────────┘                  │   │
│  │                                 │                                │   │
│  └─────────────────────────────────┼────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────▼────────────────────────────────┐   │
│  │                      BACKEND (NestJS)                             │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │              Attendance Controller                        │   │   │
│  │  │                                                           │   │   │
│  │  │  POST   /attendance/mark                                 │   │   │
│  │  │  GET    /attendance/records                              │   │   │
│  │  │  GET    /attendance/analytics/monthly                    │   │   │
│  │  │  GET    /attendance/analytics/yearly                     │   │   │
│  │  │  GET    /attendance/analytics/team                       │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                 │                                │   │
│  │  ┌──────────────────────────────▼──────────────────────────┐   │   │
│  │  │              Attendance Service                          │   │   │
│  │  │                                                           │   │   │
│  │  │  • markAttendance()                                      │   │   │
│  │  │  • getAttendanceRecords()                                │   │   │
│  │  │  • getAttendanceAnalytics()                              │   │   │
│  │  │  • getUsersAttendanceAnalytics()                         │   │   │
│  │  │  • getYearlyAttendanceAnalytics()                        │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                 │                                │   │
│  │  ┌──────────────────────────────▼──────────────────────────┐   │   │
│  │  │              Attendance Schema                           │   │   │
│  │  │                                                           │   │   │
│  │  │  • userId (indexed)                                      │   │   │
│  │  │  • date (indexed)                                        │   │   │
│  │  │  • status                                                │   │   │
│  │  │  • checkInTime / checkOutTime                            │   │   │
│  │  │  • hoursWorked                                           │   │   │
│  │  │  • isApproved                                            │   │   │
│  │  │  • timestamps                                            │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                 │                                │   │
│  └─────────────────────────────────┼────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────▼────────────────────────────────┐   │
│  │                      DATABASE (MongoDB)                           │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Attendance Collection                                           │   │
│  │  ├── Index: userId + date (unique)                              │   │
│  │  ├── Index: userId + date (descending)                          │   │
│  │  └── Index: date                                                │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Employee Viewing Attendance
```
Employee navigates to /employee/attendance
         │
         ▼
Frontend loads EmployeeAttendanceDashboard
         │
         ├─► API: getMonthlyAnalytics(userId, month, year)
         │        │
         │        ▼
         │   Backend: Calculate monthly stats
         │        │
         │        ▼
         │   Return: {presentDays, absentDays, ...}
         │
         ├─► API: getYearlyAnalytics(userId, year)
         │        │
         │        ▼
         │   Backend: Calculate yearly stats
         │        │
         │        ▼
         │   Return: [{month, presentDays, ...}, ...]
         │
         ▼
Dashboard displays:
  • Monthly stats cards
  • Daily calendar breakdown
  • Yearly trend chart
```

### DB Admin Viewing Team
```
DB Admin navigates to /db-admin/attendance
         │
         ▼
Frontend loads DbAdminAttendanceDashboard
         │
         ├─► API: getUsers() - Get all team members
         │        │
         │        ▼
         │   Backend: Query users
         │        │
         │        ▼
         │   Return: [user1, user2, ...]
         │
         ├─► API: getTeamAnalytics(userIds, month, year)
         │        │
         │        ▼
         │   Backend: Calculate team stats
         │        │
         │        ▼
         │   Return: [{userId, presentDays, ...}, ...]
         │
         ▼
Dashboard displays:
  • Team overview stats
  • Team member table
  • Search/filter controls
         │
         ▼
On member selection:
         │
         ├─► API: getYearlyAnalytics(userId, year)
         │        │
         │        ▼
         │   Backend: Calculate yearly stats
         │        │
         │        ▼
         │   Return: [{month, presentDays, ...}, ...]
         │
         ▼
Display individual details
```

### Super Admin Viewing Organization
```
Super Admin navigates to /admin/attendance
         │
         ▼
Frontend loads SuperAdminAttendanceDashboard
         │
         ├─► API: getUsers() - Get all users
         │        │
         │        ▼
         │   Backend: Query all users
         │        │
         │        ▼
         │   Return: [user1, user2, ...]
         │
         ├─► API: getTeamAnalytics(allUserIds, month, year)
         │        │
         │        ▼
         │   Backend: Calculate org stats
         │        │
         │        ▼
         │   Return: [{userId, presentDays, ...}, ...]
         │
         ▼
Dashboard displays:
  • Organization stats
  • All users table
  • Search/filter controls
         │
         ▼
On user selection:
         │
         ├─► API: getYearlyAnalytics(userId, year)
         │        │
         │        ▼
         │   Backend: Calculate yearly stats
         │        │
         │        ▼
         │   Return: [{month, presentDays, ...}, ...]
         │
         ▼
Display individual details
```

## Component Hierarchy

```
DashboardLayout
├── Sidebar (Navigation)
│   ├── Admin Nav (with Attendance link)
│   ├── DB Admin Nav (with Attendance link)
│   └── Employee Nav (with Attendance link)
│
├── Header
│   ├── Breadcrumb
│   ├── NotificationBell
│   └── User Info
│
└── Main Content
    ├── EmployeeAttendanceDashboard
    │   ├── Header (Month/Year selectors)
    │   ├── Metric Cards (Present, Absent, Leave, Att%)
    │   ├── Daily Calendar
    │   └── Yearly Trend
    │
    ├── DbAdminAttendanceDashboard
    │   ├── Header (Month/Year selectors)
    │   ├── Team Overview Cards
    │   ├── Search/Filter Controls
    │   ├── Team Attendance Table
    │   └── Individual Details (on selection)
    │
    └── SuperAdminAttendanceDashboard
        ├── Header (Month/Year selectors)
        ├── Organization Overview Cards
        ├── Search/Filter Controls
        ├── All Users Table
        └── Individual Details (on selection)
```

## State Management

```
Frontend State:
├── Monthly Data
│   ├── totalDays
│   ├── presentDays
│   ├── absentDays
│   ├── leaveDays
│   ├── halfDays
│   ├── attendancePercentage
│   └── dailyBreakdown[]
│
├── Yearly Data
│   └── [{month, presentDays, absentDays, ...}, ...]
│
├── Team Data
│   └── [{userId, presentDays, absentDays, ...}, ...]
│
├── UI State
│   ├── selectedMonth
│   ├── selectedYear
│   ├── selectedUserId
│   ├── searchQuery
│   ├── roleFilter
│   └── loading
│
└── User Data
    ├── currentUser
    ├── teamMembers[]
    └── allUsers[]
```

## API Response Structure

### Monthly Analytics
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

### Yearly Analytics
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

### Team Analytics
```json
[
  {
    "userId": "user_id_1",
    "presentDays": 22,
    "absentDays": 5,
    "leaveDays": 2,
    "halfDays": 1,
    "attendancePercentage": 80
  }
]
```

## Database Query Patterns

### Get Monthly Attendance
```
db.attendances.find({
  userId: ObjectId("user_id"),
  date: {
    $gte: ISODate("2024-01-01"),
    $lte: ISODate("2024-01-31")
  }
})
```

### Get Team Attendance
```
db.attendances.find({
  userId: {
    $in: [ObjectId("user_1"), ObjectId("user_2"), ...]
  },
  date: {
    $gte: ISODate("2024-01-01"),
    $lte: ISODate("2024-01-31")
  }
})
```

### Get Yearly Attendance
```
db.attendances.find({
  userId: ObjectId("user_id"),
  date: {
    $gte: ISODate("2024-01-01"),
    $lte: ISODate("2024-12-31")
  }
})
```

## Performance Optimization

```
┌─────────────────────────────────────────┐
│      PERFORMANCE OPTIMIZATION            │
├─────────────────────────────────────────┤
│                                          │
│  Database Level:                         │
│  ├── Indexed queries (userId, date)     │
│  ├── Efficient aggregations             │
│  └── Pagination support                 │
│                                          │
│  API Level:                              │
│  ├── Caching strategies                 │
│  ├── Pagination (default 50)            │
│  └── Efficient filtering                │
│                                          │
│  Frontend Level:                         │
│  ├── Memoized components                │
│  ├── Client-side filtering              │
│  ├── Lazy loading                       │
│  └── Optimized re-renders               │
│                                          │
└─────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────┐
│         SECURITY ARCHITECTURE            │
├─────────────────────────────────────────┤
│                                          │
│  Authentication:                         │
│  ├── JWT tokens                         │
│  ├── Token validation                   │
│  └── Session management                 │
│                                          │
│  Authorization:                          │
│  ├── Role-based access control          │
│  ├── Employee sees own only             │
│  ├── DB Admin sees team only            │
│  └── Super Admin sees all               │
│                                          │
│  Data Protection:                        │
│  ├── Input validation                   │
│  ├── SQL injection prevention           │
│  ├── XSS prevention                     │
│  └── CSRF protection                    │
│                                          │
└─────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│       DEPLOYMENT ARCHITECTURE            │
├─────────────────────────────────────────┤
│                                          │
│  Frontend:                               │
│  ├── Next.js 14 (App Router)            │
│  ├── Tailwind CSS                       │
│  ├── TypeScript                         │
│  └── Deployed on Vercel/Docker          │
│                                          │
│  Backend:                                │
│  ├── NestJS                             │
│  ├── TypeScript                         │
│  ├── JWT Authentication                 │
│  └── Deployed on Docker/K8s             │
│                                          │
│  Database:                               │
│  ├── MongoDB                            │
│  ├── Indexed collections                │
│  └── Backup strategy                    │
│                                          │
│  Infrastructure:                         │
│  ├── Docker containers                  │
│  ├── Nginx reverse proxy                │
│  ├── SSL/TLS encryption                 │
│  └── Load balancing                     │
│                                          │
└─────────────────────────────────────────┘
```

## Integration Points

```
┌─────────────────────────────────────────┐
│        INTEGRATION POINTS                │
├─────────────────────────────────────────┤
│                                          │
│  1. Backend Module Integration:          │
│     └── Add to app.module.ts            │
│                                          │
│  2. Frontend Navigation Integration:     │
│     ├── Admin nav (updated)             │
│     ├── DB Admin nav (new)              │
│     └── Employee nav (new)              │
│                                          │
│  3. Layout Integration:                  │
│     └── DashboardLayout (updated)       │
│                                          │
│  4. API Integration:                     │
│     └── Attendance service              │
│                                          │
│  5. Database Integration:                │
│     └── MongoDB schema                  │
│                                          │
└─────────────────────────────────────────┘
```

---

**Complete Architecture Ready for Implementation!**
