# Attendance Dashboard - Visual Guide

## Employee Attendance Dashboard

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ My Attendance                          [Month ▼] [Year ▼]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────┐ │
│  │ Present Days │  │ Absent Days  │  │ Leave Days   │  │ Att% │ │
│  │      22      │  │      5       │  │      2       │  │ 80%  │ │
│  │   [icon]     │  │   [icon]     │  │   [icon]     │  │[icon]│ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────┘ │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Daily Breakdown                                                   │
├─────────────────────────────────────────────────────────────────┤
│  Sun  Mon  Tue  Wed  Thu  Fri  Sat                               │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                            │
│  │1 │ │2 │ │3 │ │4 │ │5 │ │6 │ │7 │                            │
│  │P │ │P │ │A │ │P │ │P │ │P │ │L │                            │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                            │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                            │
│  │8 │ │9 │ │10│ │11│ │12│ │13│ │14│                            │
│  │P │ │P │ │P │ │P │ │H │ │P │ │P │                            │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                            │
│  ... (rest of month)                                             │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Yearly Trend                                                      │
├─────────────────────────────────────────────────────────────────┤
│ Jan  ████████████████░░ 80%  22P / 5A                           │
│ Feb  ██████████████░░░░ 75%  20P / 8A                           │
│ Mar  ████████████████████ 90%  24P / 3A                         │
│ Apr  ██████████░░░░░░░░░ 60%  16P / 12A                         │
│ ... (rest of year)                                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Legend:
P = Present (Green)
A = Absent (Red)
L = Leave (Blue)
H = Half-Day (Yellow)
```

## DB Admin Attendance Dashboard

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ Team Attendance                        [Month ▼] [Year ▼]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────┐ │
│  │Team Members  │  │Avg Attendance│  │Total Present │  │Total │ │
│  │      12      │  │     78%      │  │     245      │  │Absent│ │
│  │   [icon]     │  │   [icon]     │  │   [icon]     │  │ 45   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────┘ │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Team Attendance Table                                             │
├─────────────────────────────────────────────────────────────────┤
│ Employee          │ Present │ Absent │ Leave │ Half │ Att% │Act │
├───────────────────┼─────────┼────────┼───────┼──────┼──────┼────┤
│ John Doe          │   22    │   5    │   2   │  1   │ 80%  │View│
│ jane@email.com    │         │        │       │      │      │    │
├───────────────────┼─────────┼────────┼───────┼──────┼──────┼────┤
│ Jane Smith        │   20    │   7    │   2   │  1   │ 75%  │View│
│ jane@email.com    │         │        │       │      │      │    │
├───────────────────┼─────────┼────────┼───────┼──────┼──────┼────┤
│ Mike Johnson      │   24    │   3    │   2   │  1   │ 90%  │View│
│ mike@email.com    │         │        │       │      │      │    │
│ ... (more members)                                                │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ [When "View" is clicked]                                          │
│                                                                   │
│ John Doe - Yearly Trend                                    [Close]│
├─────────────────────────────────────────────────────────────────┤
│ Jan  ████████████████░░ 80%  22P / 5A                           │
│ Feb  ██████████████░░░░ 75%  20P / 8A                           │
│ Mar  ████████████████████ 90%  24P / 3A                         │
│ ... (rest of year)                                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Super Admin Attendance Dashboard

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ Organization Attendance                [Month ▼] [Year ▼]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────┐ │
│  │Total Users   │  │Avg Attendance│  │Total Present │  │Total │ │
│  │      45      │  │     76%      │  │     892      │  │Absent│ │
│  │   [icon]     │  │   [icon]     │  │   [icon]     │  │ 198  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────┘ │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ [Search: ________________]  [Role: All Roles ▼]                 │
├─────────────────────────────────────────────────────────────────┤
│ User                  │ Role      │ Present │ Absent │ Att% │Act │
├───────────────────────┼───────────┼─────────┼────────┼──────┼────┤
│ Admin User            │Super Admin│   22    │   5    │ 80%  │View│
│ admin@email.com       │           │         │        │      │    │
├───────────────────────┼───────────┼─────────┼────────┼──────┼────┤
│ DB Admin 1            │DB Admin   │   20    │   7    │ 75%  │View│
│ dbadmin1@email.com    │           │         │        │      │    │
├───────────────────────┼───────────┼─────────┼────────┼──────┼────┤
│ Employee 1            │Employee   │   24    │   3    │ 90%  │View│
│ emp1@email.com        │           │         │        │      │    │
│ ... (more users)                                                  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ [When "View" is clicked]                                          │
│                                                                   │
│ John Doe                                                   [Close]│
│ john@email.com                                                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────┐ │
│  │ Present Days │  │ Absent Days  │  │ Leave Days   │  │ Att% │ │
│  │      22      │  │      5       │  │      2       │  │ 80%  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────┘ │
│                                                                   │
│ Yearly Trend                                                      │
│ Jan  ████████████████░░ 80%  22P / 5A                           │
│ Feb  ██████████████░░░░ 75%  20P / 8A                           │
│ Mar  ████████████████████ 90%  24P / 3A                         │
│ ... (rest of year)                                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Color Coding Reference

### Status Colors
```
┌─────────────┬──────────┬─────────────────────────────────────┐
│ Status      │ Color    │ Hex Code                            │
├─────────────┼──────────┼─────────────────────────────────────┤
│ Present     │ Green    │ #10b981 (Emerald-500)               │
│ Absent      │ Red      │ #ef4444 (Red-500)                   │
│ Leave       │ Blue     │ #3b82f6 (Blue-500)                  │
│ Half-Day    │ Yellow   │ #eab308 (Yellow-500)                │
└─────────────┴──────────┴─────────────────────────────────────┘
```

### Badge Colors
```
Present Days:  ┌─────────────────┐
               │ 22              │  Green background
               │ [Calendar icon] │  Green text
               └─────────────────┘

Absent Days:   ┌─────────────────┐
               │ 5               │  Red background
               │ [Alert icon]    │  Red text
               └─────────────────┘

Leave Days:    ┌─────────────────┐
               │ 2               │  Blue background
               │ [Clock icon]    │  Blue text
               └─────────────────┘

Attendance %:  ┌─────────────────┐
               │ 80%             │  Slate background
               │ [Trending icon] │  Slate text
               └─────────────────┘
```

## Responsive Breakpoints

### Mobile (<640px)
```
┌──────────────────────────┐
│ My Attendance            │
│ [Month ▼] [Year ▼]       │
├──────────────────────────┤
│ ┌────────────────────┐   │
│ │ Present Days: 22   │   │
│ └────────────────────┘   │
│ ┌────────────────────┐   │
│ │ Absent Days: 5     │   │
│ └────────────────────┘   │
│ ┌────────────────────┐   │
│ │ Leave Days: 2      │   │
│ └────────────────────┘   │
│ ┌────────────────────┐   │
│ │ Attendance: 80%    │   │
│ └────────────────────┘   │
│                          │
│ Daily Breakdown          │
│ [Calendar grid]          │
│                          │
│ Yearly Trend             │
│ [Trend bars]             │
└──────────────────────────┘
```

### Tablet (640px - 1024px)
```
┌────────────────────────────────────────┐
│ My Attendance      [Month ▼] [Year ▼]  │
├────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐    │
│ │ Present: 22  │  │ Absent: 5    │    │
│ └──────────────┘  └──────────────┘    │
│ ┌──────────────┐  ┌──────────────┐    │
│ │ Leave: 2     │  │ Attendance%: │    │
│ │              │  │ 80%          │    │
│ └──────────────┘  └──────────────┘    │
│                                        │
│ Daily Breakdown                        │
│ [Calendar grid - 2 columns]            │
│                                        │
│ Yearly Trend                           │
│ [Trend bars]                           │
└────────────────────────────────────────┘
```

### Desktop (>1024px)
```
┌──────────────────────────────────────────────────────────────┐
│ My Attendance                      [Month ▼] [Year ▼]        │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│ │ Present  │  │ Absent   │  │ Leave    │  │ Att%     │      │
│ │ 22       │  │ 5        │  │ 2        │  │ 80%      │      │
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                               │
│ Daily Breakdown                                               │
│ [Full calendar grid - 7 columns]                             │
│                                                               │
│ Yearly Trend                                                  │
│ [Full trend bars for all 12 months]                          │
└──────────────────────────────────────────────────────────────┘
```

## Interactive Elements

### Metric Cards
```
┌─────────────────────────────┐
│ Present Days                │  ← Label (uppercase, small)
│                             │
│ 22                          │  ← Value (large, bold)
│                             │
│ [Calendar Icon]             │  ← Icon (right-aligned)
└─────────────────────────────┘
  Hover: Slight shadow increase
  Click: No action (info only)
```

### Buttons
```
[View]  ← Text button
  Hover: Color change to blue
  Click: Show details

[Close] ← Text button
  Hover: Color change to slate
  Click: Hide details
```

### Dropdowns
```
[Month ▼]  ← Select dropdown
  Options: January, February, ..., December
  Default: Current month

[Year ▼]   ← Select dropdown
  Options: 2023, 2024, 2025
  Default: Current year
```

### Search Input
```
[🔍 Search by name or email...]  ← Search field
  Placeholder: "Search by name or email..."
  Real-time filtering
  Case-insensitive
```

### Filter Dropdown
```
[Role: All Roles ▼]  ← Filter dropdown
  Options:
    - All Roles
    - Super Admin
    - DB Admin
    - Employee
```

## Data Table Structure

### Column Headers
```
┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────┐
│ Employee     │ Present  │ Absent   │ Leave    │ Half-Day │ Att% │
│ (left-align) │ (center) │ (center) │ (center) │ (center) │(ctr) │
└──────────────┴──────────┴──────────┴──────────┴──────────┴──────┘
```

### Row Data
```
┌──────────────────────┬──────────┬──────────┬──────────┬──────────┬──────┐
│ John Doe             │ [22]     │ [5]      │ [2]      │ [1]      │ 80%  │
│ john@email.com       │ (green)  │ (red)    │ (blue)   │ (yellow) │ bar  │
└──────────────────────┴──────────┴──────────┴──────────┴──────────┴──────┘
```

## Progress Bar Visualization

### Attendance Percentage Bar
```
80% Attendance:
┌─────────────────────────────────────────┐
│████████████████░░░░░░░░░░░░░░░░░░░░░░░░│  80%
└─────────────────────────────────────────┘
  Green gradient fill

50% Attendance:
┌─────────────────────────────────────────┐
│██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  50%
└─────────────────────────────────────────┘
  Green gradient fill

30% Attendance:
┌─────────────────────────────────────────┐
│██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  30%
└─────────────────────────────────────────┘
  Green gradient fill
```

## Animation & Transitions

### Loading State
```
Loading attendance data...
  ↓ (spinner animation)
  ↓
Dashboard appears with fade-in
```

### Month/Year Change
```
Select new month/year
  ↓ (fade out)
  ↓ (fetch new data)
  ↓ (fade in)
Dashboard updates with new data
```

### View Details
```
Click "View" button
  ↓ (slide down animation)
  ↓ (fetch yearly data)
  ↓ (fade in)
Details panel appears
```

---

**Note**: All colors, spacing, and layouts follow Tailwind CSS design system for consistency.
