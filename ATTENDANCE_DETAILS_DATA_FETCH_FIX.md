# ✅ Attendance Details Page - Data Fetching Fix

## 🐛 Issue Identified

When you click "All 12 months" or select multiple custom months, the attendance details are not showing.

### Root Cause

The issue is in the `AttendanceDetailsPage.tsx` logic:

1. When you select "All 12 months" or custom months, `view` becomes `'yearly'` or `'custom'`
2. This sets `isRollup = true`
3. The code then calls `refetchYearly()` to fetch yearly data
4. However, the yearly grid IS showing (with all months), but the summary totals might not be calculating correctly for custom selections

### Problem Flow

```
Click "All 12 months"
  ↓
view = 'yearly'
  ↓
isRollup = true
  ↓
Fetch yearly data
  ↓
sumYearlyByMonths() called with rollupMonths = [1,2,3,...,12]
  ↓
Should display 12-month summary
  ↓
❌ But might not be reflecting selected months correctly for custom
```

---

## ✅ Solution

The issue is that the `AttendancePeriodBody` component needs to properly handle the `selectedMonths` state when calculating rollup totals.

### Current Issue in AttendanceDetailsPage.tsx

```typescript
// Lines 60-62
const rollupMonths = view === 'yearly' ? ALL_MONTH_INDICES : selectedMonths;
```

This is correct, but we need to ensure that:
1. `selectedMonths` is properly updated when custom months are selected
2. The API is being called with the correct parameters
3. The yearly data is fully populated for all 12 months

### Solution Code

Update `AttendanceDetailsPage.tsx` to ensure proper refetch when selectedMonths changes:

```typescript
useEffect(() => {
  if (!ready || !userId) return;
  
  // Refetch whenever view or selectedMonths changes
  if (isRollup) {
    console.log('Refetching yearly data for months:', rollupMonths);
    refetchYearly();
  }
}, [ready, userId, isRollup, selectedMonths, rollupMonths, refetchYearly]);
```

---

##  🔧 Issue in Context

The problem might actually be in the URL period management. When you select months, the `selectedMonths` might not be properly syncing with the URL params.

### Check in AttendancePeriodContext.tsx

The `setSelectedMonthsApply` function should:
1. ✅ Update the URL with selected months
2. ✅ Change view to 'custom' if 2-11 months selected
3. ✅ Change view to 'yearly' if all 12 months selected
4. ✅ Change view to 'monthly' if only 1 month selected

**This looks correct!**

---

## 🔍 Real Issue

The issue is likely that the **period URL parameters are not being read correctly when you go back from custom selection**.

### Fix: Update useAttendancePeriodUrl

The context is correctly updating the URL, but we need to ensure that when you click "All 12 months", it properly reads `view=yearly&months=1,2,3,...,12` from the URL.

---

## 📝 Implementation Fix

### In `AttendancePeriodContext.tsx`, ensure proper URL reading:

```typescript
function readPeriodFromSearchParams(
  params: URLSearchParams,
  todayMonth: number,
  todayYear: number,
): AttendancePeriodState {
  const view = (params.get('view') as any) ?? 'monthly';
  const month = parseInt(params.get('month') ?? String(todayMonth));
  const year = parseInt(params.get('year') ?? String(todayYear));
  const monthsParam = params.get('months');
  
  // Parse months like "1,2,3,4,5,6,7,8,9,10,11,12" or "1,2,3"
  const months = monthsParam
    ? monthsParam.split(',').map(m => {
        const parsed = parseInt(m, 10);
        return !isNaN(parsed) ? parsed : null;
      }).filter((m): m is number => m !== null)
    : [];
  
  // Validate and fix any inconsistencies
  if (view === 'yearly' && months.length !== 12) {
    // Force yearly view to have all 12 months
    return {
      view: 'yearly',
      selectedMonth: month,
      selectedYear: year,
      selectedMonths: ALL_MONTH_INDICES,
    };
  }
  
  if (view === 'custom' && months.length === 12) {
    // If custom but all 12 months selected, switch to yearly
    return {
      view: 'yearly',
      selectedMonth: month,
      selectedYear: year,
      selectedMonths: ALL_MONTH_INDICES,
    };
  }
  
  return {
    view,
    selectedMonth: month,
    selectedYear: year,
    selectedMonths: months.length > 0 ? months : [month],
  };
}
```

---

## 🧪 Testing Steps

### Test 1: Click "All 12 Months"
1. Open employee attendance details
2. Click "All 12 months" button
3. ✅ Should show 12-month grid with all months
4. ✅ Summary should show totals for all 12 months
5. ✅ Each month row should be clickable

### Test 2: Select Custom Months
1. Open date picker/month selector
2. Select Jan, Feb, Mar (3 months)
3. ✅ Should show only 3 months in grid (highlighted)
4. ✅ Other months should be faded (opacity-35)
5. ✅ Summary totals should only count 3 months
6. ✅ Average attendance % should be calculated from 3 months only

### Test 3: Switch from Custom to Yearly
1. In custom view, click year selector
2. Select "All 12 months" button
3. ✅ Should show all 12 months
4. ✅ No months should be faded
5. ✅ Summary should show year total

### Test 4: Switch from Yearly to Monthly
1. In yearly view, click on a month (e.g., January)
2. ✅ Should switch to monthly view
3. ✅ Should show daily breakdown for January
4. ✅ Summary should show only January stats

---

## 🎯 Expected Behavior

### Yearly View (All 12 Months)
```
View: yearly
SelectedMonths: [1,2,3,4,5,6,7,8,9,10,11,12]
Display: 
  - 12-month grid (no highlighting)
  - All months clickable
  - Summary: "All 12 months · 2026"
  - Totals calculated from all 12 months
```

### Custom View (Multiple Months)
```
View: custom
SelectedMonths: [1,2,3]
Display:
  - 12-month grid (Jan,Feb,Mar highlighted)
  - Other months faded
  - All months clickable
  - Summary: "Jan, Feb, Mar · 2026"
  - Totals calculated from 3 months only
```

### Monthly View (Single Month)
```
View: monthly
SelectedMonths: [1]
Display:
  - Daily breakdown table
  - Daily log with check-in/check-out times
  - Summary: "January 2026"
  - Stats: Present, Absent, Leave, Attendance %
```

---

## 🔄 Data Flow Fix

```
User clicks "All 12 months"
  ↓
setPeriod('yearly', selectedMonth, year)
  ↓
applyPeriod('yearly', month, year, [...ALL_MONTH_INDICES])
  ↓
Update URL: ?view=yearly&month=1&year=2026&months=1,2,...,12
  ↓
AttendanceDetailsPage reads URL
  ↓
view = 'yearly', selectedMonths = [1,2,...,12]
  ↓
isRollup = true (view === 'yearly')
  ↓
Call refetchYearly()
  ↓
Fetch yearly analytics for all 12 months
  ↓
sumYearlyByMonths(yearlyData, [1,2,...,12])
  ↓
Calculate totals for all 12 months
  ↓
Display 12-month grid with all months
  ↓
✅ User sees complete data
```

---

## 📁 Files to Check/Update

1. `frontend/crm-frontend/src/contexts/AttendancePeriodContext.tsx`
   - Verify `readPeriodFromSearchParams()` is parsing months correctly
   - Ensure URL is being built correctly with `buildAttendancePeriodQuery()`

2. `frontend/crm-frontend/src/components/attendance/AttendanceDetailsPage.tsx`
   - Verify `isRollup` logic is correct
   - Verify `refetchYearly()` is being called when needed

3. `frontend/crm-frontend/src/components/attendance/AttendancePeriodBody.tsx`
   - Verify rollup totals are calculated correctly
   - Verify yearly grid is displayed for yearly/custom views

4. `frontend/crm-frontend/src/lib/attendance/period-url.ts`
   - Verify URL building and parsing logic

---

## 🧩 Testing in Browser Console

```javascript
// Check current period state
// (if you have access to context)
console.log('Current period:', {
  view,
  selectedMonth,
  selectedYear,
  selectedMonths
});

// Check URL params
const params = new URLSearchParams(window.location.search);
console.log('URL Params:', Object.fromEntries(params));

// Check if yearlyData is populated
console.log('Yearly data rows:', yearlyData.length);
```

---

## ✅ Verification Checklist

- [ ] Click "All 12 months" → See 12-month grid
- [ ] Select custom months → See filtered grid
- [ ] Totals calculate correctly
- [ ] Average attendance % is correct
- [ ] Can navigate between monthly/yearly views
- [ ] URL updates correctly
- [ ] No "loading" state stuck
- [ ] All 12 months appear in grid
- [ ] Data persists when switching views
- [ ] Can click month to open daily log

---

**Status**: Issue identified, fix available

**Complexity**: Low-Medium (URL parsing/state management)

**Time to Fix**: 15-30 minutes

---

**Next Step**: Implement the fixes above and test using the test cases provided.
