'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { attendanceService, type AttendanceAnalytics, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { AttendanceYearlyExcelGrid } from '@/components/attendance/AttendanceYearlyExcelGrid';
import { AttendanceMonthlySummarySheet } from '@/components/attendance/AttendanceMonthlySummarySheet';
import { AttendancePeriodTabs, type AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function EmployeeAttendanceDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [monthlyData, setMonthlyData] = useState<AttendanceAnalytics | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<AttendancePeriodView>('monthly');

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const monthLabel = `${MONTHS[selectedMonth - 1]} ${selectedYear}`;

  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'yearly' || v === 'monthly') setView(v);
    const m = searchParams.get('month');
    const y = searchParams.get('year');
    if (m && !Number.isNaN(Number(m))) setSelectedMonth(Number(m));
    if (y && !Number.isNaN(Number(y))) setSelectedYear(Number(y));
  }, [searchParams]);

  const syncUrl = useCallback(
    (nextView: AttendancePeriodView, month: number, year: number) => {
      const params = new URLSearchParams();
      params.set('view', nextView);
      params.set('month', String(month));
      params.set('year', String(year));
      router.replace(`/employee/attendance?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const handleViewChange = (next: AttendancePeriodView) => {
    setView(next);
    syncUrl(next, selectedMonth, selectedYear);
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [monthly, yearly] = await Promise.all([
        attendanceService.getMonthlyAnalytics(user.id, selectedMonth, selectedYear),
        attendanceService.getYearlyAnalytics(user.id, selectedYear),
      ]);
      setMonthlyData(monthly);
      setYearlyData(yearly);
    } catch (error) {
      console.error('Failed to fetch attendance data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const onRefresh = () => fetchData();
    window.addEventListener('attendance:refresh', onRefresh);
    window.addEventListener('work-time:refresh', onRefresh);
    return () => {
      window.removeEventListener('attendance:refresh', onRefresh);
      window.removeEventListener('work-time:refresh', onRefresh);
    };
  }, [fetchData]);

  const handleMonthYearChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
    syncUrl(view, month, year);
  };

  const openMonthFromYearly = (monthIndex: number) => {
    setSelectedMonth(monthIndex);
    setView('monthly');
    syncUrl('monthly', monthIndex, selectedYear);
  };

  const yearlyTotals = useMemo(() => {
    if (!yearlyData.length) return null;
    return {
      present: yearlyData.reduce((s, m) => s + m.presentDays, 0),
      absent: yearlyData.reduce((s, m) => s + m.absentDays, 0),
      leave: yearlyData.reduce((s, m) => s + m.leaveDays, 0),
      avgPct: Math.round(
        yearlyData.reduce((s, m) => s + m.attendancePercentage, 0) / yearlyData.length,
      ),
    };
  }, [yearlyData]);

  if (!user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const periodControl =
    view === 'monthly' ? (
      <>
        <label className="text-sm font-medium text-slate-600">Month</label>
        <select
          value={selectedMonth}
          onChange={(e) => handleMonthYearChange(Number(e.target.value), selectedYear)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <label className="text-sm font-medium text-slate-600">Year</label>
        <select
          value={selectedYear}
          onChange={(e) => handleMonthYearChange(selectedMonth, Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="ml-auto text-xs font-medium text-slate-400">{monthLabel}</span>
      </>
    ) : (
      <>
        <label className="text-sm font-medium text-slate-600">Year</label>
        <select
          value={selectedYear}
          onChange={(e) => handleMonthYearChange(selectedMonth, Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="ml-auto text-xs font-medium text-slate-400">Full year {selectedYear}</span>
      </>
    );

  const stats =
    view === 'monthly' && monthlyData
      ? [
              {
                label: 'Present',
                value: monthlyData.presentDays,
                tone: 'green' as const,
                checkHistoryHref: '/employee/attendance?view=monthly#attendance-daily-log',
              },
          { label: 'Absent', value: monthlyData.absentDays, tone: 'red' as const },
          { label: 'Leave', value: monthlyData.leaveDays, tone: 'blue' as const },
          { label: 'Attendance %', value: `${monthlyData.attendancePercentage}%`, tone: 'neutral' as const },
        ]
      : yearlyTotals
        ? [
            { label: 'Year present', value: yearlyTotals.present, tone: 'green' as const },
            { label: 'Year absent', value: yearlyTotals.absent, tone: 'red' as const },
            { label: 'Year leave', value: yearlyTotals.leave, tone: 'blue' as const },
            { label: 'Avg %', value: `${yearlyTotals.avgPct}%`, tone: 'neutral' as const },
          ]
        : undefined;

  return (
    <AttendancePageChrome
      title="My Attendance"
      subtitle={
        view === 'monthly'
          ? 'Monthly: day-by-day sheet + summary. Switch to Yearly for all 12 months.'
          : 'Yearly: 12-month rollup. Press Enter on a month to open that month’s daily sheet.'
      }
      accent="emerald"
      loading={loading}
      onRefresh={fetchData}
      monthControl={
        <div className="flex w-full flex-wrap items-center gap-3">
          <AttendancePeriodTabs view={view} onChange={handleViewChange} />
          {periodControl}
        </div>
      }
      stats={stats}
    >
      {view === 'monthly' ? (
        <div className="flex w-full min-w-0 flex-col gap-5">
          <AttendanceMonthlySummarySheet
            data={monthlyData}
            monthLabel={monthLabel}
            loading={loading}
            checkHistoryHref="/employee/attendance?view=monthly#attendance-daily-log"
          />
          <section id="attendance-daily-log" className="w-full space-y-2 scroll-mt-24">
            <h2 className="text-sm font-semibold text-slate-700">Daily log — {monthLabel}</h2>
            <AttendanceDailyExcelGrid
              rows={monthlyData?.dailyBreakdown ?? []}
              loading={loading}
              sheetTitle="Daily Attendance"
              monthLabel={monthLabel}
            />
          </section>
        </div>
      ) : (
        <div className="w-full min-w-0">
        <AttendanceYearlyExcelGrid
          rows={yearlyData}
          loading={loading}
          year={selectedYear}
          onSelectMonth={openMonthFromYearly}
        />
        </div>
      )}
    </AttendancePageChrome>
  );
}
