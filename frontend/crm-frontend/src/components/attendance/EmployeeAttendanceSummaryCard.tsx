'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarRange, RefreshCw } from 'lucide-react';
import { attendanceService } from '@/lib/api/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils/cn';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function EmployeeAttendanceSummaryCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [present, setPresent] = useState(0);
  const [absent, setAbsent] = useState(0);
  const [pct, setPct] = useState(0);
  const [yearPresent, setYearPresent] = useState(0);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [monthly, yearly] = await Promise.all([
        attendanceService.getMonthlyAnalytics(user.id, month, year),
        attendanceService.getYearlyAnalytics(user.id, year),
      ]);
      setPresent(monthly.presentDays);
      setAbsent(monthly.absentDays);
      setPct(monthly.attendancePercentage);
      setYearPresent(yearly.reduce((s, m) => s + m.presentDays, 0));
    } catch {
      setPresent(0);
      setAbsent(0);
      setPct(0);
      setYearPresent(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [user?.id]);

  return (
    <div className="border border-slate-300 bg-white">
      <div className="flex items-center justify-between border-b border-slate-300 bg-[#217346] px-3 py-2 text-white">
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
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase text-slate-500">{monthLabel}</p>
        {loading ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-[#217346]">{present}</p>
              <p className="text-[10px] text-slate-500">Present</p>
              <Link
                href="/employee/attendance?view=monthly#attendance-daily-log"
                className="mt-0.5 inline-block text-[10px] font-semibold text-[#217346] underline"
              >
                Check history
              </Link>
            </div>
            <div>
              <p className="text-lg font-bold text-[#c00000]">{absent}</p>
              <p className="text-[10px] text-slate-500">Absent</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{pct}%</p>
              <p className="text-[10px] text-slate-500">This month</p>
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          Year {year}: <span className="font-semibold text-[#217346]">{yearPresent}</span> present days total
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/employee/attendance?view=monthly"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-[#217346] hover:bg-emerald-100"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Monthly sheet
          </Link>
          <Link
            href="/employee/attendance?view=yearly"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Yearly sheet
          </Link>
        </div>
      </div>
    </div>
  );
}
