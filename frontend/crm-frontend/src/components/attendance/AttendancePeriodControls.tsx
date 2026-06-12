'use client';

import { AttendancePeriodTabs, type AttendancePeriodAccent } from '@/components/attendance/AttendancePeriodTabs';
import { AttendanceMonthYearNav } from '@/components/attendance/AttendanceMonthYearNav';
import { useAttendancePeriodUrl } from '@/contexts/AttendancePeriodContext';

interface AttendancePeriodControlsProps {
  accent?: AttendancePeriodAccent;
}

function PeriodControlsSkeleton() {
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <div className="h-10 w-[220px] animate-pulse rounded-xl bg-slate-100" aria-hidden />
      <div className="h-10 min-w-[200px] flex-1 animate-pulse rounded-lg bg-slate-100" aria-hidden />
    </div>
  );
}

export function AttendancePeriodControls({ accent = 'admin' }: AttendancePeriodControlsProps) {
  const {
    ready,
    view,
    selectedMonth,
    selectedYear,
    selectedMonths,
    setView,
    setMonthYear,
    setSelectedMonthsApply,
  } = useAttendancePeriodUrl();

  if (!ready) {
    return <PeriodControlsSkeleton />;
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <AttendancePeriodTabs view={view} onChange={setView} accent={accent} />
      <AttendanceMonthYearNav
        month={selectedMonth}
        year={selectedYear}
        selectedMonths={selectedMonths}
        view={view}
        onChange={setMonthYear}
        onMonthsApply={setSelectedMonthsApply}
        onSelectFullYear={() => setView('yearly')}
        accent={accent}
        className="flex-1"
      />
    </div>
  );
}
