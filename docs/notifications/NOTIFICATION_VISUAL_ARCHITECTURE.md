# Notification System - Visual Architecture & Flow

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  NotificationBell Component                              │  │
│  │  - Shows unread count                                    │  │
│  │  - Displays notification list                            │  │
│  │  - Mark as read / Delete                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │ Socket.io                           │
│                           │ Events                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Zustand Store (notification.store.ts)                   │  │
│  │  - notifications: []                                     │  │
│  │  - unreadCount: number                                   │  │
│  │  - addNotification()                                     │  │
│  │  - markAsRead()                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  useNotifications Hook                                   │  │
│  │  - Connects to socket                                    │  │
│  │  - Subscribes to events                                  │  │
│  │  - Updates store                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │ Socket.io                           │
│                           │ Connection                          │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            │ ws://localhost:4000/events
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                           ▼                                     │
│                        BACKEND (NestJS)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  EventsGateway (Socket.io)                               │  │
│  │  - Handles WebSocket connections                         │  │
│  │  - Emits notifications to users                          │  │
│  │  - Manages user rooms (user:userId)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  NotificationTriggerService                              │  │
│  │  - notifyUser()                                          │  │
│  │  - notifySuperAdmins()                                   │  │
│  │  - notifyDbAdmins()                                      │  │
│  │  - notifyAttendanceMarked()                              │  │
│  │  - notifyLeaveApplied()                                  │  │
│  │  - notifyLeaveApproved()                                 │  │
│  │  - notifyLeaveRejected()                                 │  │
│  │  - notifyUserCreated()                                   │  │
│  │  - notifyBatchCreated()                                  │  │
│  │  - notifyBatchUpdated()                                  │  │
│  │  - notifyBatchDeleted()                                  │  │
│  │  - notifyDataUploaded()                                  │  │
│  │  - notifySystemAlert()                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Modules (Attendance, Leave, Users, Batch)               │  │
│  │  - Call NotificationTriggerService                       │  │
│  │  - Pass user/role information                            │  │
│  │  - Trigger notifications on activities                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MongoDB (Notifications Collection)                      │  │
│  │  - Stores all notifications                              │  │
│  │  - Persists notification history                         │  │
│  │  - Tracks read/unread status                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Notification Flow Diagram

### Activity Triggers Notification

```
┌─────────────────────────────────────────────────────────────────┐
│ USER ACTION                                                     │
│ (Mark Attendance, Apply Leave, Create User, etc.)              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE METHOD CALLED                                           │
│ (markAttendance, applyLeave, createUser, etc.)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ BUSINESS LOGIC EXECUTED                                         │
│ (Save to database, validate, etc.)                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATION TRIGGER SERVICE CALLED                             │
│ (notifyAttendanceMarked, notifyLeaveApplied, etc.)             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ SAVE TO DATABASE                                                │
│ (MongoDB notifications collection)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ EMIT SOCKET.IO EVENT                                            │
│ (notification:receive)                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND RECEIVES EVENT                                         │
│ (via Socket.io connection)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ZUSTAND STORE UPDATED                                           │
│ (addNotification, setUnreadCount)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATION BELL UPDATED                                       │
│ (Shows unread count, displays notification)                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER SEES NOTIFICATION                                          │
│ (In notification bell dropdown)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 👥 Role-Based Distribution

```
┌──────────────────────────────────────────────────────────────────┐
│ NOTIFICATION TRIGGERED                                           │
│ (e.g., User marked attendance)                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ NOTIFICATION TRIGGER SERVICE                                     │
│ Determines recipients based on role                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │ SUPER   │      │   DB    │      │EMPLOYEE │
   │ ADMIN   │      │ ADMIN   │      │         │
   └────┬────┘      └────┬────┘      └────┬────┘
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │ Notify  │      │ Notify  │      │ Notify  │
   │ All     │      │ DB      │      │ User    │
   │ Super   │      │ Admins  │      │ Only    │
   │ Admins  │      │         │      │         │
   └────┬────┘      └────┬────┘      └────┬────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ SAVE TO DATABASE               │
        │ (MongoDB)                      │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ EMIT SOCKET.IO EVENTS          │
        │ (to user rooms)                │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ FRONTEND RECEIVES & DISPLAYS   │
        │ (Notification bell)            │
        └────────────────────────────────┘
```

---

## 📊 Notification Types & Recipients

```
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATION TYPE                                               │
├─────────────────────────────────────────────────────────────────┤
│ attendance_marked                                               │
│ ├─ Employee: ✅ (personal)                                     │
│ ├─ DB Admin: ✅ (team)                                         │
│ └─ Super Admin: ✅ (all)                                       │
├─────────────────────────────────────────────────────────────────┤
│ leave_applied                                                   │
│ ├─ Employee: ✅ (personal)                                     │
│ ├─ DB Admin: ✅ (team)                                         │
│ └─ Super Admin: ✅ (all)                                       │
├─────────────────────────────────────────────────────────────────┤
│ leave_approved                                                  │
│ ├─ Employee: ✅ (personal)                                     │
│ ├─ DB Admin: ✅ (team)                                         │
│ └─ Super Admin: ✅ (all)                                       │
├─────────────────────────────────────────────────────────────────┤
│ leave_rejected                                                  │
│ ├─ Employee: ✅ (personal)                                     │
│ ├─ DB Admin: ✅ (team)                                         │
│ └─ Super Admin: ✅ (all)                                       │
├─────────────────────────────────────────────────────────────────┤
│ user_created                                                    │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅ (if employee)                                  │
│ └─ Super Admin: ✅                                             │
├─────────────────────────────────────────────────────────────────┤
│ batch_created                                                   │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅                                                │
│ └─ Super Admin: ✅                                             │
├─────────────────────────────────────────────────────────────────┤
│ batch_updated                                                   │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅                                                │
│ └─ Super Admin: ✅                                             │
├─────────────────────────────────────────────────────────────────┤
│ batch_deleted                                                   │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅                                                │
│ └─ Super Admin: ✅                                             │
├─────────────────────────────────────────────────────────────────┤
│ data_uploaded                                                   │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅                                                │
│ └─ Super Admin: ✅                                             │
├─────────────────────────────────────────────────────────────────┤
│ system_alert                                                    │
│ ├─ Employee: ❌                                                │
│ ├─ DB Admin: ✅                                                │
│ └─ Super Admin: ✅                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Socket.io Events

```
┌─────────────────────────────────────────────────────────────────┐
│ INCOMING EVENTS (Backend → Frontend)                            │
├─────────────────────────────────────────────────────────────────┤
│ notification:receive                                            │
│ └─ Generic notification event                                  │
│                                                                 │
│ notification:batch-created                                     │
│ └─ Batch created event                                         │
│                                                                 │
│ notification:batch-updated                                     │
│ └─ Batch updated event                                         │
│                                                                 │
│ notification:batch-completed                                   │
│ └─ Batch completed event                                       │
│                                                                 │
│ notification:user-added                                        │
│ └─ User added event                                            │
│                                                                 │
│ notification:data-uploaded                                     │
│ └─ Data uploaded event                                         │
│                                                                 │
│ notification:system-alert                                      │
│ └─ System alert event                                          │
│                                                                 │
│ notification:unread-count                                      │
│ └─ Unread count update                                         │
├─────────────────────────────────────────────────────────────────┤
│ OUTGOING EVENTS (Frontend → Backend)                            │
├─────────────────────────────────────────────────────────────────┤
│ notification:mark-read                                         │
│ └─ Mark single notification as read                            │
│                                                                 │
│ notification:mark-all-read                                     │
│ └─ Mark all notifications as read                              │
│                                                                 │
│ notification:delete                                            │
│ └─ Delete notification                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📱 Frontend Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ App Component                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ NotificationProvider                                     │  │
│  │ (Initializes socket & notifications)                    │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │ useNotifications Hook                              │ │  │
│  │  │ (Manages socket connection & subscriptions)        │ │  │
│  │  │                                                    │ │  │
│  │  │  ┌──────────────────────────────────────────────┐ │ │  │
│  │  │  │ NotificationBell Component                   │ │ │  │
│  │  │  │ (Displays notifications)                     │ │ │  │
│  │  │  │                                              │ │ │  │
│  │  │  │  ┌────────────────────────────────────────┐ │ │ │  │
│  │  │  │  │ NotificationToast                      │ │ │ │  │
│  │  │  │  │ (Auto-dismiss notifications)           │ │ │ │  │
│  │  │  │  └────────────────────────────────────────┘ │ │ │  │
│  │  │  │                                              │ │ │  │
│  │  │  │  ┌────────────────────────────────────────┐ │ │ │  │
│  │  │  │  │ Notification Dropdown                  │ │ │ │  │
│  │  │  │  │ (Shows all notifications)              │ │ │ │  │
│  │  │  │  └────────────────────────────────────────┘ │ │ │  │
│  │  │  └──────────────────────────────────────────────┘ │ │  │
│  │  │                                                    │ │  │
│  │  │  ┌──────────────────────────────────────────────┐ │ │  │
│  │  │  │ Zustand Store (notification.store.ts)       │ │ │  │
│  │  │  │ - notifications: []                         │ │ │  │
│  │  │  │ - unreadCount: number                       │ │ │  │
│  │  │  └──────────────────────────────────────────────┘ │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security & Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│ USER CONNECTS TO SOCKET                                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ JWT TOKEN VERIFIED                                              │
│ (EventsGateway.handleConnection)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │          │
                    ▼          ▼
              ┌─────────┐  ┌─────────┐
              │ VALID   │  │ INVALID │
              └────┬────┘  └────┬────┘
                   │            │
                   ▼            ▼
            ┌────────────┐  ┌──────────┐
            │ JOIN ROOM  │  │DISCONNECT│
            │ user:userId│  │          │
            └────┬───────┘  └──────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ RECEIVE EVENTS     │
        │ FOR THIS USER ONLY │
        └────────────────────┘
```

---

## 📈 Data Flow Summary

```
Activity Triggered
    ↓
Service Method
    ↓
Business Logic
    ↓
NotificationTriggerService
    ├─ Determine Recipients (by role)
    ├─ Save to Database
    └─ Emit Socket.io Event
        ├─ To Super Admin Room
        ├─ To DB Admin Room
        └─ To Employee Room
            ↓
        Frontend Receives Event
            ├─ Update Zustand Store
            ├─ Update Notification Bell
            └─ Show Toast (optional)
                ↓
            User Sees Notification
```

---

## ✅ Integration Checklist

```
┌─────────────────────────────────────────────────────────────────┐
│ ATTENDANCE MODULE                                               │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Import NotificationsModule                                   │
│ ☐ Inject NotificationTriggerService                            │
│ ☐ Add notification call in markAttendance()                    │
│ ☐ Test: Mark attendance → See notification                     │
├─────────────────────────────────────────────────────────────────┤
│ LEAVE MODULE                                                    │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Import NotificationsModule                                   │
│ ☐ Inject NotificationTriggerService                            │
│ ☐ Add notification call in applyLeave()                        │
│ ☐ Add notification call in approveLeave()                      │
│ ☐ Add notification call in rejectLeave()                       │
│ ☐ Test: Apply/approve/reject leave → See notifications         │
├─────────────────────────────────────────────────────────────────┤
│ USERS MODULE                                                    │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Import NotificationsModule                                   │
│ ☐ Inject NotificationTriggerService                            │
│ ☐ Add notification call in createUser()                        │
│ ☐ Test: Create user → See notification                         │
├─────────────────────────────────────────────────────────────────┤
│ BATCH MODULE (if exists)                                        │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Import NotificationsModule                                   │
│ ☐ Inject NotificationTriggerService                            │
│ ☐ Add notification calls in create/update/delete               │
│ ☐ Test: Batch operations → See notifications                   │
├─────────────────────────────────────────────────────────────────┤
│ TESTING                                                         │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Test Super Admin notifications                               │
│ ☐ Test DB Admin notifications                                  │
│ ☐ Test Employee notifications                                  │
│ ☐ Verify role-based filtering                                  │
│ ☐ Check socket connection                                      │
│ ☐ Verify database persistence                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

**Visual diagrams complete!** 📊

For implementation, follow the quick reference guide or integration guide.
