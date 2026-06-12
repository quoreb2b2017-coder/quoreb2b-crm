'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAttendancePeriodUrl } from '@/hooks/useAttendancePeriodUrl';
import { useYearlyAttendance } from '@/hooks/useYearlyAttendance';
import { attendanceService, type AttendanceAnalytics } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { AttendancePeriodControls } from '@/components/attendance/AttendancePeriodControls';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';
import { AttendancePeriodBody } from '@/components/attendance/AttendancePeriodBody';
import { formatMonthYearLabel } from '@/lib/attendance/month-year';
import { ALL_MONTH_INDICES, sumYearlyByMonths } from '@/lib/attendance/yearly-analytics';
import { buildAttendancePeriodStats } from '@/lib/attendance/build-period-stats';
import { periodViewDescription } from '@/lib/attendance/period-labels';
import { buildAttendancePageUrl } from '@/lib/attendance/period-url';

const ATTENDANCE_PATH = '/employee/attendance';

export function EmployeeAttendanceDashboard() {
  const { user } = useAuth();
  const {
    ready,
    view,
    selectedMonth,
    selectedYear,
    selectedMonths,
    setPeriod,
  } = useAttendancePeriodUrl();
  const [monthlyData, setMonthlyData] = useState<AttendanceAnalytics | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const isRollup = view === 'yearly' || view === 'custom';
  const rollupMonths = view === 'yearly' ? ALL_MONTH_INDICES : selectedMonths;

  const { yearlyData, yearlyLoading, refetchYearly } = useYearlyAttendance(
    user?.id,
    selectedYear,
    Boolean(user?.id) && isRollup,
  );

  const monthLabel = formatMonthYearLabel(selectedMonth, selectedYear);

  const fetchMonthly = useCallback(async () => {
    if (!user?.id || isRollup) return;
    setMonthlyLoading(true);
    try {
      const monthly = await attendanceService.getMonthlyAnalytics(
        user.id,
        selectedMonth,
        selectedYear,
        true,
      );
      setMonthlyData(monthly);
    } catch (error) {
      console.error('Failed to fetch attendance data:', error);
    } finally {
      setMonthlyLoading(false);
    }
  }, [user?.id, selectedMonth, selectedYear, isRollup]);

  useEffect(() => {
    if (!ready) return;
    if (!isRollup) fetchMonthly();
  }, [ready, fetchMonthly, isRollup]);

  useEffect(() => {
    if (!ready) return;
    if (isRollup) refetchYearly();
  }, [ready, isRollup, selectedYear, refetchYearly]);

  useEffect(() => {
    const onRefresh = () => {
      if (!isRollup) fetchMonthly();
      else refetchYearly();
    };
    window.addEventListener('attendance:refresh', onRefresh);
    window.addEventListener('work-time:refresh', onRefresh);
    return () => {
      window.removeEventListener('attendance:refresh', onRefresh);
      window.removeEventListener('work-time:refresh', onRefresh);
    };
  }, [fetchMonthly, isRollup, refetchYearly]);

  const openMonthFromYearly = (monthIndex: number) => {
    setPeriod('monthly', monthIndex, selectedYear);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (hash === 'attendance-yearly-grid' && isRollup) {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isRollup, yearlyLoading]);

  const rollupTotals = useMemo(
    () => sumYearlyByMonths(yearlyData, rollupMonths),
    [yearlyData, rollupMonths],
  );

  const pageLoading = isRollup ? yearlyLoading : monthlyLoading;

  const monthlyHistoryHref = buildAttendancePageUrl(
    ATTENDANCE_PATH,
    { view: 'monthly', selectedMonth, selectedYear },
    'attendance-daily-log',
  );
  const yearlyHistoryHref = buildAttendancePageUrl(
    ATTENDANCE_PATH,
    { view: 'yearly', selectedMonth, selectedYear },
    'attendance-yearly-grid',
  );

  if (!user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const stats = buildAttendancePeriodStats(view, monthlyData, rollupTotals, {
    checkHistoryHref: monthlyHistoryHref,
    yearlyHistoryHref,
  });

  return (
    <AttendancePageChrome
      title="My Attendance"
      subtitle={periodViewDescription(view)}
      accent="emerald"
      loading={pageLoading}
      onRefresh={() => {
        if (!isRollup) fetchMonthly();
        else refetchYearly();
      }}
      showMarkToday={false}
      monthControl={<AttendancePeriodControls accent="emerald" />}
      stats={ready ? stats : undefined}
    >
      {ready ? (
      <AttendancePeriodBody
        view={view}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        selectedMonths={selectedMonths}
        monthLabel={monthLabel}
        monthlyData={monthlyData}
        monthlyLoading={monthlyLoading}
        yearlyData={yearlyData}
        yearlyLoading={yearlyLoading}
        rollupTotals={rollupTotals}
        accent="emerald"
        checkHistoryHref={monthlyHistoryHref}
        liveToday
        onSelectMonth={openMonthFromYearly}
      />
      ) : (
        <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />
      )}
    </AttendancePageChrome>
  );
}
