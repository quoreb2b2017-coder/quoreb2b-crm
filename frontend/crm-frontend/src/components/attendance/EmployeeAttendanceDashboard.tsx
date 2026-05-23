'use client';

import { useEffect, useState, useCallback } from 'react';
import { attendanceService, type AttendanceAnalytics, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function EmployeeAttendanceDashboard() {
  const { user } = useAuth();
  const [monthlyData, setMonthlyData] = useState<AttendanceAnalytics | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const monthLabel = `${MONTHS[selectedMonth - 1]} ${selectedYear}`;

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

  if (!user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const monthControl = (
    <>
      <label className="text-sm font-medium text-slate-600">Month</label>
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <label className="text-sm font-medium text-slate-600">Year</label>
      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <span className="ml-auto text-xs font-medium text-slate-400">{monthLabel}</span>
    </>
  );

  return (
    <AttendancePageChrome
      title="My Attendance"
      subtitle="Excel-style daily log — use sidebar Quick actions to mark or apply leave"
      accent="emerald"
      loading={loading}
      onRefresh={fetchData}
      monthControl={monthControl}
      stats={
        monthlyData
          ? [
              { label: 'Present', value: monthlyData.presentDays, tone: 'green' },
              { label: 'Absent', value: monthlyData.absentDays, tone: 'red' },
              { label: 'Leave', value: monthlyData.leaveDays, tone: 'blue' },
              { label: 'Attendance %', value: `${monthlyData.attendancePercentage}%`, tone: 'neutral' },
            ]
          : undefined
      }
    >
      <AttendanceDailyExcelGrid
        rows={monthlyData?.dailyBreakdown ?? []}
        loading={loading}
        monthLabel={monthLabel}
      />

      {yearlyData.length > 0 && !loading && (
        <ExcelSheetShell title={`Yearly Summary — ${selectedYear}`} rowCount={yearlyData.length}>
          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Month', 'Present', 'Absent', 'Leave', 'Attendance %'].map((h) => (
                    <th
                      key={h}
                      className="border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearlyData.map((month) => (
                  <tr key={month.month} className="even:bg-[#fafafa]">
                    <td className="border border-[#e0e0e0] px-2 py-1 font-medium">{month.month}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center text-[#217346]">{month.presentDays}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center text-[#c00000]">{month.absentDays}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center text-[#2e75b6]">{month.leaveDays}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center font-semibold">{month.attendancePercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExcelSheetShell>
      )}
    </AttendancePageChrome>
  );
}
