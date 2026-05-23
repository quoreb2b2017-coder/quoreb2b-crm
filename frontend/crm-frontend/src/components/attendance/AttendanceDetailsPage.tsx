'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Calendar, Users, BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import { attendanceService, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { usersService } from '@/lib/api/users.service';

interface UserDetails {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
}

interface MonthlyStats {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
}

export function AttendanceDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const [user, setUser] = useState<UserDetails | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  useEffect(() => {
    if (!userId) {
      router.push('/super-admin/attendance');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [userRes, monthlyRes, yearlyRes] = await Promise.all([
          usersService.getById(userId),
          attendanceService.getMonthlyAnalytics(userId, new Date().getMonth() + 1, new Date().getFullYear()),
          attendanceService.getYearlyAnalytics(userId, selectedYear),
        ]);

        const userData = userRes.data;
        setUser({
          _id: String(userData.id ?? userData._id ?? ''),
          firstName: String(userData.firstName ?? ''),
          lastName: String(userData.lastName ?? ''),
          email: String(userData.email ?? ''),
          employeeId: userData.employeeId ? String(userData.employeeId) : undefined,
          roles: Array.isArray(userData.roles) ? (userData.roles as string[]) : [],
        });

        setMonthlyStats({
          presentDays: monthlyRes.presentDays || 0,
          absentDays: monthlyRes.absentDays || 0,
          leaveDays: monthlyRes.leaveDays || 0,
          attendancePercentage: monthlyRes.attendancePercentage || 0,
        });

        setYearlyData(yearlyRes);
      } catch (error) {
        console.error('Failed to fetch attendance details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, selectedYear, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-2" />
            <p className="text-slate-500">Loading attendance details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-slate-500 mb-4">User not found</p>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super-admin':
        return 'bg-purple-100 text-purple-700';
      case 'db-admin':
        return 'bg-indigo-100 text-indigo-700';
      case 'employee':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90) return 'from-green-500 to-green-600';
    if (percentage >= 75) return 'from-blue-500 to-blue-600';
    if (percentage >= 60) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg hover:bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-slate-900">Attendance Details</h1>
          <div className="w-24" />
        </div>

        {/* User Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{user.email}</p>
              {user.employeeId && (
                <p className="text-xs font-mono text-slate-400 mt-2 bg-slate-50 px-2 py-1 rounded w-fit">
                  ID: {user.employeeId}
                </p>
              )}
            </div>
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold capitalize ${getRoleColor(user.roles[0])}`}>
              {user.roles[0]?.replace('-', ' ')}
            </span>
          </div>
        </div>

        {/* Current Month Stats */}
        {monthlyStats && (
          <div className="space-y-6">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {/* Present Days */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Present Days</span>
                  <Calendar className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-6xl font-bold text-green-600">{monthlyStats.presentDays}</p>
                <p className="text-sm text-slate-500">Days marked present this month</p>
              </div>

              {/* Absent Days */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Absent Days</span>
                  <BarChart3 className="h-5 w-5 text-red-600" />
                </div>
                <p className="text-6xl font-bold text-red-600">{monthlyStats.absentDays}</p>
                <p className="text-sm text-slate-500">Days marked absent this month</p>
              </div>

              {/* Leave Days */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Leave Days</span>
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-6xl font-bold text-blue-600">{monthlyStats.leaveDays}</p>
                <p className="text-sm text-slate-500">Days on leave this month</p>
              </div>

              {/* Attendance Percentage */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Attendance %</span>
                  <TrendingUp className="h-5 w-5 text-slate-600" />
                </div>
                <p className="text-6xl font-bold text-slate-900">{monthlyStats.attendancePercentage}%</p>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                    style={{ width: `${monthlyStats.attendancePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}}}

        {/* Yearly Trends */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Yearly Trends</h3>
              <p className="text-sm text-slate-500 mt-1">Monthly breakdown for {selectedYear}</p>
            </div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {yearlyData.length > 0 ? (
            <div className="space-y-4">
              {yearlyData.map((month, idx) => (
                <div key={month.month} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 w-24">
                      <span className="text-sm font-semibold text-slate-700">{months[idx]}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${getAttendanceColor(month.attendancePercentage)} transition-all`}
                            style={{ width: `${month.attendancePercentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <p className="text-sm font-semibold text-slate-900">{month.attendancePercentage}%</p>
                        <p className="text-xs text-slate-500">
                          {month.presentDays}P / {month.absentDays}A / {month.leaveDays}L
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>No attendance data available for {selectedYear}</p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {yearlyData.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Year Summary</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-green-50 p-4 border border-green-200">
                <p className="text-xs font-semibold uppercase text-green-700">Total Present</p>
                <p className="mt-2 text-2xl font-bold text-green-700">
                  {yearlyData.reduce((sum, m) => sum + m.presentDays, 0)}
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-4 border border-red-200">
                <p className="text-xs font-semibold uppercase text-red-700">Total Absent</p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {yearlyData.reduce((sum, m) => sum + m.absentDays, 0)}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <p className="text-xs font-semibold uppercase text-blue-700">Total Leave</p>
                <p className="mt-2 text-2xl font-bold text-blue-700">
                  {yearlyData.reduce((sum, m) => sum + m.leaveDays, 0)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <p className="text-xs font-semibold uppercase text-slate-700">Avg Attendance</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Math.round(yearlyData.reduce((sum, m) => sum + m.attendancePercentage, 0) / yearlyData.length)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
