'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, Calendar, BarChart3, Search, RefreshCw } from 'lucide-react';
import { attendanceService, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { usersService } from '@/lib/api/users.service';
import { workTimeService } from '@/lib/api/work-time.service';
import { AttendanceTableRow } from '@/components/attendance/AttendanceTableRow';

interface TeamMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
}

interface TeamAnalytics {
  userId: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
}

export function SuperAdminAttendanceDashboard() {
  const router = useRouter();
  const [allUsers, setAllUsers] = useState<TeamMember[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<TeamMember[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [workTimeByUser, setWorkTimeByUser] = useState<Record<string, string>>({});

  function parseUserList(data: unknown): Record<string, unknown>[] {
    const outer = (data as { data?: unknown })?.data;
    if (Array.isArray(outer)) return outer;
    if (outer && typeof outer === 'object' && Array.isArray((outer as { data: unknown[] }).data)) {
      return (outer as { data: Record<string, unknown>[] }).data;
    }
    return [];
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const fetchAllUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersService.list({ limit: 500 });
      const users: TeamMember[] = parseUserList(res.data).map((u) => ({
        _id: String(u.id ?? u._id ?? ''),
        firstName: String(u.firstName ?? ''),
        lastName: String(u.lastName ?? ''),
        email: String(u.email ?? ''),
        employeeId: u.employeeId ? String(u.employeeId) : undefined,
        roles: Array.isArray(u.roles) ? (u.roles as string[]) : [],
      }));
      setAllUsers(users);
      setFilteredUsers(users);

      if (users.length > 0) {
        const userIds = users.map((u) => u._id);
        const [analytics, workTime] = await Promise.all([
          attendanceService.getTeamAnalytics(userIds, selectedMonth, selectedYear),
          workTimeService.getTeamWorkTime(userIds, selectedYear, selectedMonth),
        ]);
        setTeamAnalytics(analytics);
        const map: Record<string, string> = {};
        workTime.users.forEach((row) => {
          map[row.userId] = row.monthlyFormatted;
        });
        setWorkTimeByUser(map);
      } else {
        setTeamAnalytics([]);
        setWorkTimeByUser({});
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchAllUsers();
  }, [fetchAllUsers]);

  useEffect(() => {
    let filtered = allUsers;

    if (searchQuery) {
      filtered = filtered.filter(
        (u) =>
          u.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter((u) => u.roles.includes(roleFilter));
    }

    setFilteredUsers(filtered);
  }, [searchQuery, roleFilter, allUsers]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(Number(e.target.value));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(Number(e.target.value));
  };

  const handleRefresh = () => {
    fetchAllUsers();
  };

  const handleViewDetails = (userId: string) => {
    router.push(`/admin/attendance/details?userId=${userId}`);
  };

  const avgAttendance =
    teamAnalytics.length > 0
      ? Math.round(teamAnalytics.reduce((sum, a) => sum + a.attendancePercentage, 0) / teamAnalytics.length)
      : 0;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Organization Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor organization-wide attendance and analytics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-5 w-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-lg border border-slate-200">
        <label className="text-sm font-medium text-slate-700">Month:</label>
        <select
          value={selectedMonth}
          onChange={handleMonthChange}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {months.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>

        <label className="text-sm font-medium text-slate-700 ml-4">Year:</label>
        <select
          value={selectedYear}
          onChange={handleYearChange}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <div className="ml-auto text-xs text-slate-500">
          {months[selectedMonth - 1]} {selectedYear}
        </div>
      </div>

      {/* Organization Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Total Users</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{allUsers.length}</p>
              <p className="text-xs text-slate-500 mt-1">all users</p>
            </div>
            <Users className="h-10 w-10 text-slate-500 opacity-20" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Avg Attendance</p>
              <p className="mt-2 text-3xl font-bold text-green-600">{avgAttendance}%</p>
              <p className="text-xs text-slate-500 mt-1">organization</p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-500 opacity-20" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Total Present</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">
                {teamAnalytics.reduce((sum, a) => sum + a.presentDays, 0)}
              </p>
              <p className="text-xs text-slate-500 mt-1">days present</p>
            </div>
            <Calendar className="h-10 w-10 text-blue-500 opacity-20" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Total Absent</p>
              <p className="mt-2 text-3xl font-bold text-red-600">
                {teamAnalytics.reduce((sum, a) => sum + a.absentDays, 0)}
              </p>
              <p className="text-xs text-slate-500 mt-1">days absent</p>
            </div>
            <BarChart3 className="h-10 w-10 text-red-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-3 bg-white p-4 rounded-lg border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="super-admin">Super Admin</option>
          <option value="db-admin">DB Admin</option>
          <option value="employee">Employee</option>
        </select>
      </div>

      {/* Users Attendance Table */}
      {loading ? (
        <div className="text-center py-8 text-slate-500">
          <div className="inline-block animate-spin">
            <RefreshCw className="h-6 w-6" />
          </div>
          <p className="mt-2">Loading attendance data...</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Work time (month)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Present</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Absent</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Leave</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Attendance %</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const analytics = teamAnalytics.find((a) => a.userId === user._id);
                  return (
                    <AttendanceTableRow
                      key={user._id}
                      user={user}
                      analytics={analytics || null}
                      workTime={workTimeByUser[user._id] ?? '—'}
                      onViewDetails={handleViewDetails}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


    </div>
  );
}
