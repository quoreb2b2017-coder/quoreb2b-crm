'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAttendancePeriodUrl } from '@/contexts/AttendancePeriodContext';
import { useYearlyAttendance } from '@/hooks/useYearlyAttendance';
import { attendanceService, type AttendanceAnalytics } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { usePaidLeaveBalance } from '@/hooks/usePaidLeaveBalance';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';
import { AttendancePeriodTabs } from '@/components/attendance/AttendancePeriodTabs';
import { AttendanceMonthYearNav } from '@/components/attendance/AttendanceMonthYearNav';
import { formatMonthYearLabel } from '@/lib/attendance/month-year';
import { ALL_MONTH_INDICES, sumYearlyByMonths } from '@/lib/attendance/yearly-analytics';
import { buildAttendancePeriodStats } from '@/lib/attendance/build-period-stats';
import { buildMyPaidLeaveStats } from '@/lib/attendance/build-paid-leave-stats';
import { periodViewDescription } from '@/lib/attendance/period-labels';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { AttendanceRollupSummarySheet } from '@/components/attendance/AttendanceRollupSummarySheet';

export function EmployeeAttendanceDashboard() {
  const { user } = useAuth();
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

  const [monthlyData, setMonthlyData] = useState<AttendanceAnalytics | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const { balance: paidLeaveBalance, reload: reloadPaidBalance } = usePaidLeaveBalance(selectedYear);

  const isRollup = view === 'yearly' || view === 'custom';
  const rollupMonths = view === 'yearly' ? ALL_MONTH_INDICES : selectedMonths;

  const { yearlyData, yearlyLoading, refetchYearly } = useYearlyAttendance(
    user?.id,
    selectedYear,
    rollupMonths,
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
      console.error('Failed to fetch monthly:', error);
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
  }, [ready, isRollup, selectedYear, selectedMonths, refetchYearly]);

  const rollupTotals = useMemo(
    () => sumYearlyByMonths(yearlyData, rollupMonths),
    [yearlyData, rollupMonths],
  );

  const pageLoading = isRollup ? yearlyLoading : monthlyLoading;

  if (!user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const stats = useMemo(() => {
    const periodStats = buildAttendancePeriodStats(view, monthlyData, rollupTotals, {
      checkHistoryHref: '#attendance-daily-log',
      yearlyHistoryHref: '#attendance-yearly-grid',
    });
    const paidStats = buildMyPaidLeaveStats(paidLeaveBalance);
    return periodStats ? [...periodStats, ...paidStats] : paidStats;
  }, [view, monthlyData, rollupTotals, paidLeaveBalance]);

  const monthControl = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <AttendancePeriodTabs view={view} onChange={setView} accent="emerald" />
      <AttendanceMonthYearNav
        month={selectedMonth}
        year={selectedYear}
        selectedMonths={selectedMonths}
        view={view}
        onChange={setMonthYear}
        onMonthsApply={setSelectedMonthsApply}
        onSelectFullYear={() => setView('yearly')}
        accent="emerald"
        className="flex-1"
      />
    </div>
  );

  return (
    <AttendancePageChrome
      title="My Attendance"
      subtitle={periodViewDescription(view)}
      accent="emerald"
      loading={pageLoading}
      onRefresh={() => {
        if (!isRollup) fetchMonthly();
        else refetchYearly();
        reloadPaidBalance();
      }}
      showMarkToday={false}
      monthControl={monthControl}
      stats={ready ? stats : undefined}
    >
      {ready ? (
        <div className="space-y-4">
          {!isRollup && monthlyData && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Daily log</h2>
              <AttendanceDailyExcelGrid
                liveToday
                rows={monthlyData.dailyBreakdown ?? []}
                loading={monthlyLoading}
                sheetTitle={`My Daily Attendance — ${monthLabel}`}
                monthLabel={monthLabel}
              />
            </section>
          )}

          {isRollup && yearlyData.length > 0 && (
            <section className="space-y-2" id="attendance-yearly-grid">
              <h2 className="text-sm font-semibold text-slate-700">Yearly summary</h2>
              <AttendanceRollupSummarySheet
                view={view}
                year={selectedYear}
                monthLabel={monthLabel}
                selectedMonths={rollupMonths}
                totals={rollupTotals}
                loading={yearlyLoading}
              />
            </section>
          )}
        </div>
      ) : (
        <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />
      )}
    </AttendancePageChrome>
  );
}
