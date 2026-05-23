'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  attendanceService,
  type AttendanceAnalytics,
  type YearlyAnalytics,
} from '@/lib/api/attendance.service';
import { usersService } from '@/lib/api/users.service';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { AttendanceYearlyExcelGrid } from '@/components/attendance/AttendanceYearlyExcelGrid';
import { AttendanceMonthlySummarySheet } from '@/components/attendance/AttendanceMonthlySummarySheet';
import { AttendancePeriodTabs, type AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { cn } from '@/lib/utils/cn';

interface UserDetails {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function AttendanceDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const backPath = searchParams.get('from') === 'db-admin' ? '/db-admin/attendance' : '/admin/attendance';

  const [user, setUser] = useState<UserDetails | null>(null);
  const [monthly, setMonthly] = useState<AttendanceAnalytics | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
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
      if (!userId) return;
      const params = new URLSearchParams();
      params.set('userId', userId);
      params.set('view', nextView);
      params.set('month', String(month));
      params.set('year', String(year));
      if (searchParams.get('from')) params.set('from', searchParams.get('from')!);
      router.replace(`${backPath}/details?${params.toString()}`, { scroll: false });
    },
    [userId, router, backPath, searchParams],
  );

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [userRes, monthlyRes, yearlyRes] = await Promise.all([
        usersService.getById(userId),
        attendanceService.getMonthlyAnalytics(userId, selectedMonth, selectedYear),
        attendanceService.getYearlyAnalytics(userId, selectedYear),
      ]);

      const userData = userRes.data as Record<string, unknown>;
      setUser({
        id: String(userData.id ?? userData._id ?? ''),
        firstName: String(userData.firstName ?? ''),
        lastName: String(userData.lastName ?? ''),
        email: String(userData.email ?? ''),
        employeeId: userData.employeeId ? String(userData.employeeId) : undefined,
        roles: Array.isArray(userData.roles) ? (userData.roles as string[]) : [],
      });
      setMonthly(monthlyRes);
      setYearlyData(yearlyRes);
    } catch (error) {
      console.error('Failed to fetch attendance details:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!userId) {
      router.replace(backPath);
      return;
    }
    fetchData();
  }, [userId, fetchData, router, backPath]);

  const handleViewChange = (next: AttendancePeriodView) => {
    setView(next);
    syncUrl(next, selectedMonth, selectedYear);
  };

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
      avgPct: Math.round(
        yearlyData.reduce((s, m) => s + m.attendancePercentage, 0) / yearlyData.length,
      ),
    };
  }, [yearlyData]);

  if (!userId) return null;

  return (
    <AttendanceFullBleed className="gap-3 py-3 sm:gap-4 sm:py-4 animate-fade-in">
      <div className="relative w-full max-w-none overflow-hidden rounded-none bg-gradient-to-br from-[#1a5c38] via-[#217346] to-[#0d0f14] px-4 py-4 text-white shadow-lg ring-1 ring-emerald-500/30 sm:rounded-xl sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="rounded-xl border border-white/30 p-2.5 hover:bg-white/10"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              {loading ? (
                <p className="text-sm text-white/70">Loading…</p>
              ) : user ? (
                <>
                  <h1 className="text-xl font-bold md:text-2xl">
                    {user.firstName} {user.lastName}
                  </h1>
                  <p className="mt-1 text-sm text-white/75">{user.email}</p>
                </>
              ) : (
                <h1 className="text-xl font-bold">User not found</h1>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="rounded-xl border border-white/30 p-2.5 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="flex w-full max-w-none flex-wrap items-center gap-3 border-y border-slate-200/80 bg-white px-3 py-3 sm:rounded-xl sm:border sm:px-4">
        <AttendancePeriodTabs view={view} onChange={handleViewChange} />
        {view === 'monthly' ? (
          <>
            <label className="text-sm font-medium text-slate-600">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthYearChange(Number(e.target.value), selectedYear)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <label className="text-sm font-medium text-slate-600">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => handleMonthYearChange(selectedMonth, Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className="text-sm font-medium text-slate-600">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => handleMonthYearChange(selectedMonth, Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {view === 'monthly' && monthly && !loading && (
        <div className="grid w-full max-w-none grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {[
            {
              label: 'Present',
              value: monthly.presentDays,
              tone: 'text-[#217346]',
              checkHistoryHref: '#attendance-daily-log',
            },
            { label: 'Absent', value: monthly.absentDays, tone: 'text-[#c00000]' },
            { label: 'Leave', value: monthly.leaveDays, tone: 'text-[#2e75b6]' },
            { label: 'Half', value: monthly.halfDays, tone: 'text-[#bf8f00]' },
            { label: '%', value: `${monthly.attendancePercentage}%`, tone: 'text-slate-900' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm sm:rounded-xl sm:px-4">
              <p className="text-[10px] font-bold uppercase text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', s.tone)}>{s.value}</p>
              {'checkHistoryHref' in s && s.checkHistoryHref && (
                <Link
                  href={s.checkHistoryHref}
                  className="mt-1.5 inline-block text-xs font-semibold text-[#217346] underline underline-offset-2"
                >
                  Check history
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'yearly' && yearlyTotals && !loading && (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">Year present</p>
            <p className="mt-1 text-2xl font-bold text-[#217346]">{yearlyTotals.present}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">Year absent</p>
            <p className="mt-1 text-2xl font-bold text-[#c00000]">{yearlyTotals.absent}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">Avg %</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{yearlyTotals.avgPct}%</p>
          </div>
        </div>
      )}

      {view === 'monthly' ? (
        <div className="flex w-full min-w-0 flex-col gap-5">
          <AttendanceMonthlySummarySheet
            data={monthly}
            monthLabel={monthLabel}
            loading={loading}
            checkHistoryHref="#attendance-daily-log"
          />
          <section id="attendance-daily-log" className="w-full space-y-2 scroll-mt-24">
            <h2 className="text-sm font-semibold text-slate-700">Daily log — {monthLabel}</h2>
            <AttendanceDailyExcelGrid
              rows={monthly?.dailyBreakdown ?? []}
              loading={loading}
              sheetTitle={`${user?.firstName ?? ''} — Daily`}
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
          sheetTitle={`${user?.firstName ?? ''} ${user?.lastName ?? ''} — ${selectedYear}`}
          onSelectMonth={openMonthFromYearly}
        />
        </div>
      )}
    </AttendanceFullBleed>
  );
}
