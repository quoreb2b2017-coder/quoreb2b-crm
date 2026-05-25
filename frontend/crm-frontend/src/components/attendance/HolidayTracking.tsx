'use client';

import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Users } from 'lucide-react';
import { attendanceService, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { useFetch } from '@/hooks/useFetch';
import { cn } from '@/lib/utils/cn';

interface HolidayTrackingProps {
  userId?: string;
  variant?: 'admin' | 'employee' | 'db_admin';
}

export function HolidayTracking({ userId, variant = 'employee' }: HolidayTrackingProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState(userId || '');
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string; email: string }>>([]);

  const { data: yearlyData, loading } = useFetch(
    selectedUserId ? `holiday-tracking:${selectedUserId}:${selectedYear}` : null,
    () => selectedUserId ? attendanceService.getYearlyAnalytics(selectedUserId, selectedYear) : Promise.resolve([]),
  );

  useEffect(() => {
    if (!userId && variant === 'admin') {
      // Fetch users list for admin
      // This would be from a users service
    }
  }, [userId, variant]);

  const totalLeaves = yearlyData?.reduce((sum, m) => sum + m.leaveDays, 0) || 0;
  const totalPaidLeaves = yearlyData?.reduce((sum, m) => sum + m.paidLeaveDays, 0) || 0;
  const totalUnpaidLeaves = totalLeaves - totalPaidLeaves;

  const accentColor = variant === 'admin' ? 'emerald' : variant === 'db_admin' ? 'violet' : 'emerald';
  const accentBg = accentColor === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-violet-50 dark:bg-violet-900/20';
  const accentBorder = accentColor === 'emerald' ? 'border-emerald-200 dark:border-emerald-800' : 'border-violet-200 dark:border-violet-800';
  const accentText = accentColor === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-violet-700 dark:text-violet-300';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Holiday & Leave Tracking
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View month-wise and yearly leave summary
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {variant === 'admin' && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <option value="">Select Employee</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cn('rounded-xl border p-4', accentBg, accentBorder)}>
          <p className={cn('text-xs font-semibold uppercase tracking-wide', accentText)}>Total Leaves</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{totalLeaves}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Days taken in {selectedYear}</p>
        </div>

        <div className={cn('rounded-xl border p-4', accentBg, accentBorder)}>
          <p className={cn('text-xs font-semibold uppercase tracking-wide', accentText)}>Paid Leaves</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">{totalPaidLeaves}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Paid leave days</p>
        </div>

        <div className={cn('rounded-xl border p-4', accentBg, accentBorder)}>
          <p className={cn('text-xs font-semibold uppercase tracking-wide', accentText)}>Unpaid Leaves</p>
          <p className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">{totalUnpaidLeaves}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Unpaid leave days</p>
        </div>
      </div>

      {/* Monthly Breakdown */}
      {loading ? (
        <div className="space-y-3">
          {Array(12).fill(0).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : yearlyData && yearlyData.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Month-wise Breakdown</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {yearlyData.map((month) => (
              <div
                key={month.month}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">{month.month}</h4>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {month.attendancePercentage}%
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Present</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{month.presentDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Leaves</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{month.leaveDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Paid</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{month.paidLeaveDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Unpaid</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {month.leaveDays - month.paidLeaveDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Absent</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{month.absentDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Weekends</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-400">{month.weekendDays}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                    style={{ width: `${month.attendancePercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-8 text-center">
          <Calendar className="h-8 w-8 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-400">No attendance data available</p>
        </div>
      )}
    </div>
  );
}
