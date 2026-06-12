# Custom Month Selection - UI Flow Guide

## Screen 1: Period Selection Tabs
```
┌─────────────────────────────────────────────────┐
│ [One month]  [All 12 months]  [Custom]          │  ← 3 tabs now available
└─────────────────────────────────────────────────┘
```

## Screen 2A: Custom Tab Selected
```
Period Selector:
┌─────────────────────────────────────────────────┐
│ [◄]  [►]  [Multi-Month Picker ▼]  [2026]  Today│
└─────────────────────────────────────────────────┘
        ↓ Click the dropdown
```

## Screen 2B: Month Multi-Picker Dropdown
```
┌──────────────────────────────────────────────┐
│ Select month(s) — tick multiple              │
├──────────────────────────────────────────────┤
│ [Select all]  [All 12 & apply]  [Clear]      │
├──────────────────────────────────────────────┤
│ ☐ January       ☐ July                       │
│ ☐ February      ☐ August                     │
│ ☑ March    ← User clicks here    ☐ September│
│ ☐ April         ☐ October                    │
│ ☐ May           ☐ November                   │
│ ☐ June          ☑ December   ← And here     │
├──────────────────────────────────────────────┤
│             [Cancel]  [Apply (2)]             │ ← Apply 2 selected months
└──────────────────────────────────────────────┘
```

## Screen 3: Custom View Display
```
📊 Attendance Details — John Doe

Period: [One month] [All 12 months] [Custom]
Nav:    [◄] [►]  [Mar, Dec ▼]  [2026]  Today

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 Month-by-month — selected (2)              ← Shows "2 months selected"

Present Days      : 44
Absent Days       : 5
Leave Days        : 1
Average %         : 89.5%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daily log — Mar, Dec

┌─────────────────────────────────────────────┐
│ Month      │ Present │ Absent │ Leave │  %   │
├─────────────────────────────────────────────┤
│ March 2026 │   22    │   3    │   0   │ 88%  │
│ December..│   22    │   2    │   1   │ 91%  │
└─────────────────────────────────────────────┘
```

## Usage Examples

### Example 1: View Jan, Feb, June
1. Click "Custom" tab
2. Click multi-picker dropdown
3. Check Jan, Feb, June
4. Click "Apply (3)"
5. See aggregated data for Q1 and June

### Example 2: View All 12 Months
1. Click "All 12 months" tab
2. Click "All 12 & apply" in the picker
3. See full year summary

### Example 3: Switch Back to Single Month
1. Click "One month" tab
2. Use month dropdown to select specific month
3. See detailed daily breakdown

### Example 4: Change Year
1. Select "Custom" view with Jan, Feb, June
2. Change year from 2026 to 2025 using year dropdown
3. Same months (Jan, Feb, June) load from 2025

## Key Features

✅ **Multi-select with checkboxes** - Click individual month boxes
✅ **Batch select** - "Select all" button for quick full-year
✅ **Quick apply** - "All 12 & apply" switches to yearly view
✅ **Clear selection** - "Clear" button to reset all checkboxes
✅ **URL persistence** - Browser back/forward works correctly
✅ **Dynamic label** - Shows "Month-by-month — selected (X)"
✅ **Parallel loading** - All selected months load simultaneously
✅ **Aggregation** - Totals calculated across selected months only

## What Happens Behind the Scenes

When user selects "Jan, Feb, June":

```
Frontend                          Backend
─────────────────────────────────────────────
Custom (1,2,6) selected
    │
    ├─ Request: GET /attendance/monthly-analytics?month=1&year=2026
    ├─ Request: GET /attendance/monthly-analytics?month=2&year=2026
    ├─ Request: GET /attendance/monthly-analytics?month=6&year=2026
    │  (All 3 requests in parallel)
    │
    ├─ Receives Jan data
    ├─ Receives Feb data
    ├─ Receives June data
    │
    └─ Aggregates:
       - Sum all present days (Jan + Feb + June)
       - Sum all absent days (Jan + Feb + June)
       - Sum all leave days (Jan + Feb + June)
       - Calculate average attendance %
       - Display in "Month-by-month" summary sheet
```

## URL Format

When viewing custom months:

```
/?view=custom&month=1&year=2026&months=1,2,6

view=custom     → Custom tab is active
month=1         → Default/reference month (usually first selected)
year=2026       → Selected year
months=1,2,6    → Comma-separated list of selected month numbers
```

## Notes

- Minimum 1 month must be selected (cannot apply with 0 months)
- Selecting all 12 months automatically switches to "yearly" view
- Year selector works independently with all views
- "Today" button shows current month (or current year range)
- Multi-picker closes on outside click or Cancel button
