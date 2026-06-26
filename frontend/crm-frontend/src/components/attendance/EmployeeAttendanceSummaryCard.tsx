'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { attendanceService, type AttendanceAnalytics } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils/cn';
import './attendance.css';
import { AttendanceDashboardStats } from '@/components/attendance/AttendanceDashboardStats';
import { AttendanceMonthCalendar } from '@/components/attendance/AttendanceMonthCalendar';
import { AttendanceMonthYearNav } from '@/components/attendance/AttendanceMonthYearNav';
import { DAILY_NET_WORK_TARGET_LABEL } from '@/lib/attendance/attendance-shift.constants';
import { todayDateKey } from '@/lib/constants/workspace-timezone';
import {
  countHolidaysInBreakdown,
  resolveCalendarStatus,
} from '@/lib/attendance/attendance-calendar';
import { formatMonthYearLabel, getCurrentMonthYear } from '@/lib/attendance/month-year';
import { buildAttendancePageUrl } from '@/lib/attendance/period-url';

interface AttendanceSummaryCardProps {
  basePath?: string;
  variant?: 'full' | 'dashboard';
  accent?: 'emerald' | 'violet' | 'admin';
}

export function AttendanceSummaryCard({
  basePath = '/employee/attendance',
  variant = 'full',
  accent = 'emerald',
}: AttendanceSummaryCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<AttendanceAnalytics | null>(null);
  const initial = getCurrentMonthYear();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const viewingCurrentRef = useRef(true);

  const monthLabel = formatMonthYearLabel(month, year);
  const monthlySheetHref = buildAttendancePageUrl(basePath, {
    view: 'monthly',
    selectedMonth: month,
    selectedYear: year,
  });
  const yearlySheetHref = buildAttendancePageUrl(
    basePath,
    { view: 'yearly', selectedMonth: month, selectedYear: year },
    'attendance-yearly-grid',
  );

  const handlePeriodChange = useCallback((nextMonth: number, nextYear: number) => {
    setMonth(nextMonth);
    setYear(nextYear);
    const { month: tm, year: ty } = getCurrentMonthYear();
    viewingCurrentRef.current = nextMonth === tm && nextYear === ty;
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const monthlyData = await attendanceService.getMonthlyAnalytics(user.id, month, year, true);
      setMonthly(monthlyData);
    } catch {
      setMonthly(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, month, year]);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [load]);

  useEffect(() => {
    const syncCurrentMonth = () => {
      if (!viewingCurrentRef.current) return;
      const { month: tm, year: ty } = getCurrentMonthYear();
      setMonth((m) => {
        setYear((y) => {
          if (m === tm && y === ty) return y;
          return ty;
        });
        return tm;
      });
    };
    const id = setInterval(syncCurrentMonth, 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = useMemo(() => todayDateKey(), []);

  const todayDay = useMemo(
    () => monthly?.dailyBreakdown.find((d) => d.date.slice(0, 10) === todayKey),
    [monthly, todayKey],
  );

  const todayStatus = useMemo(
    () => resolveCalendarStatus(todayDay, todayKey),
    [todayDay, todayKey],
  );

  const present = monthly?.presentDays ?? 0;
  const absent = monthly?.absentDays ?? 0;
  const late = monthly?.lateDays ?? 0;
  const paidLeave = monthly?.paidLeaveDays ?? 0;
  const leave = Math.max(0, (monthly?.leaveDays ?? 0) - paidLeave);
  const halfDay = monthly?.halfDays ?? 0;
  const weekend = monthly?.weekendDays ?? 0;
  const holiday = monthly ? countHolidaysInBreakdown(monthly.dailyBreakdown) : 0;
  const pct = monthly?.attendancePercentage ?? 0;

  const periodNav = (
    <AttendanceMonthYearNav
      month={month}
      year={year}
      onChange={handlePeriodChange}
      accent={accent}
      className="w-full sm:w-auto"
    />
  );

  if (variant === 'dashboard') {
    return (
      <div className="att-dash-card overflow-hidden">
        <div className="att-dash-card__head">
          <p className="att-dash-card__title">Attendance</p>
          <div className="att-dash-card__head-tools">
            {periodNav}
            <Link href={yearlySheetHref} className="att-dash-card__link hidden md:inline">
              12-month report →
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="att-dash-card__refresh"
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="att-dash-card__body att-dash-card__body--vertical">
          <div className="att-dash-card__stats">
            <AttendanceDashboardStats
              present={present}
              absent={absent}
              late={late}
              leave={leave}
              paidLeave={paidLeave}
              holiday={holiday}
              halfDay={halfDay}
              weekend={weekend}
              todayStatus={todayStatus}
              todayDay={todayDay}
              monthLabel={monthLabel}
              attendancePct={pct}
              loading={loading}
              compact
              hideMonthBanner
            />
          </div>
          <div className="att-dash-card__calendar att-dash-card__calendar--short">
            <p className="att-dash-card__cal-target">{DAILY_NET_WORK_TARGET_LABEL} target · Calendar</p>
            <AttendanceMonthCalendar
              year={year}
              month={month}
              monthLabel={monthLabel}
              dailyBreakdown={monthly?.dailyBreakdown ?? []}
              loading={loading}
              variant="dashboard"
              appearance="soft"
              weekStart="sun"
              hideHeader
              fillWidth
              className="att-dash-cal"
            />
          </div>
        </div>
        <div className="att-dash-card__foot sm:hidden">
          <div className="flex flex-wrap gap-3">
            <Link href={monthlySheetHref} className="att-dash-card__link inline-flex items-center gap-1">
              This month
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <Link href={yearlySheetHref} className="att-dash-card__link inline-flex items-center gap-1">
              12-month report
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-emerald-800/20 bg-gradient-to-r from-[#2568b8] to-[#2e7ad1] px-4 py-2.5 text-white">
        <span className="text-xs font-bold uppercase tracking-wide">Attendance</span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded p-1 hover:bg-white/15 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <div className="space-y-3 px-4 pb-4 pt-3">
        {periodNav}
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div>
              <p className="text-lg font-bold text-[#22C55E]">{present}</p>
              <p className="text-[10px] text-slate-500">Present</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[#EF4444]">{absent}</p>
              <p className="text-[10px] text-slate-500">Absent</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[#F59E0B]">{late}</p>
              <p className="text-[10px] text-slate-500">Present (Late)</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{pct}%</p>
              <p className="text-[10px] text-slate-500">This month</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link
            href={monthlySheetHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2e7ad1] hover:underline"
          >
            This month
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={yearlySheetHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2e7ad1] hover:underline"
          >
            12-month report
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export const EmployeeAttendanceSummaryCard = AttendanceSummaryCard;
