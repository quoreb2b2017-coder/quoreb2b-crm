'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { attendanceService } from '@/lib/api/attendance.service';
import { usersService } from '@/lib/api/users.service';
import { workTimeService } from '@/lib/api/work-time.service';
import { TeamAttendanceExcelTable, type TeamAttendanceRow } from '@/components/attendance/TeamAttendanceExcelTable';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';
import { AttendanceMonthYearNav } from '@/components/attendance/AttendanceMonthYearNav';
import { formatMonthYearLabel } from '@/lib/attendance/month-year';

interface OrgUser {
  id: string;
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
  halfDays: number;
  attendancePercentage: number;
}

function parseUserList(data: unknown): Record<string, unknown>[] {
  const outer = (data as { data?: unknown })?.data;
  if (Array.isArray(outer)) return outer;
  if (outer && typeof outer === 'object' && Array.isArray((outer as { data: unknown[] }).data)) {
    return (outer as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export function SuperAdminAttendanceDashboard() {
  const [allUsers, setAllUsers] = useState<OrgUser[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [workTimeByUser, setWorkTimeByUser] = useState<Record<string, string>>({});

  const monthLabel = formatMonthYearLabel(selectedMonth, selectedYear);

  const handleMonthYearChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const fetchAllUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersService.list({ limit: 500 });
      const users: OrgUser[] = parseUserList(res.data).map((u) => ({
        id: String(u.id ?? u._id ?? ''),
        firstName: String(u.firstName ?? ''),
        lastName: String(u.lastName ?? ''),
        email: String(u.email ?? ''),
        employeeId: u.employeeId ? String(u.employeeId) : undefined,
        roles: Array.isArray(u.roles) ? (u.roles as string[]) : [],
      }));
      setAllUsers(users);

      if (users.length > 0) {
        const userIds = users.map((u) => u.id);
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
    const onRefresh = () => fetchAllUsers();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [fetchAllUsers]);

  const filteredUsers = useMemo(() => {
    let list = allUsers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.employeeId?.toLowerCase().includes(q) ?? false),
      );
    }
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.roles.includes(roleFilter));
    }
    return list;
  }, [allUsers, searchQuery, roleFilter]);

  const orgRows: TeamAttendanceRow[] = useMemo(
    () =>
      filteredUsers.map((user) => {
        const analytics = teamAnalytics.find((a) => a.userId === user.id);
        return {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`.trim(),
          employeeId: user.employeeId,
          email: user.email,
          role: user.roles[0],
          presentDays: analytics?.presentDays ?? 0,
          absentDays: analytics?.absentDays ?? 0,
          leaveDays: analytics?.leaveDays ?? 0,
          halfDays: analytics?.halfDays ?? 0,
          attendancePercentage: analytics?.attendancePercentage ?? 0,
          monthlyWorkFormatted: workTimeByUser[user.id] ?? '—',
        };
      }),
    [filteredUsers, teamAnalytics, workTimeByUser],
  );

  const avgAttendance =
    teamAnalytics.length > 0
      ? Math.round(
          teamAnalytics.reduce((sum, a) => sum + a.attendancePercentage, 0) / teamAnalytics.length,
        )
      : 0;

  const monthControl = (
    <AttendanceMonthYearNav
      month={selectedMonth}
      year={selectedYear}
      onChange={handleMonthYearChange}
      accent="admin"
      className="flex-1"
    />
  );

  const filterBar = (
    <div className="flex w-full max-w-none flex-wrap items-center gap-3 border border-[#b4b4b4] bg-[#f3f3f3] px-3 py-3 shadow-sm sm:px-4">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search name, email, employee ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#217346]/30"
        />
      </div>
      <select
        value={roleFilter}
        onChange={(e) => setRoleFilter(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#217346]/30"
      >
        <option value="all">All roles</option>
        <option value="super-admin">Super Admin</option>
        <option value="db-admin">DB Admin</option>
        <option value="employee">Employee</option>
      </select>
      <span className="text-xs text-slate-500">
        {orgRows.length} of {allUsers.length} users
      </span>
    </div>
  );

  return (
    <AttendancePageChrome
      title="Organization Attendance"
      subtitle="Excel-style roster — all users, work time & monthly counts. Press Enter on a row for daily sheet."
      accent="admin"
      loading={loading}
      onRefresh={fetchAllUsers}
      monthControl={monthControl}
      stats={
        !loading
          ? [
              { label: 'Total users', value: allUsers.length, tone: 'neutral' as const },
              { label: 'Avg attendance', value: `${avgAttendance}%`, tone: 'green' as const },
              {
                label: 'Total present',
                value: teamAnalytics.reduce((s, a) => s + a.presentDays, 0),
                tone: 'green' as const,
              },
              {
                label: 'Total absent',
                value: teamAnalytics.reduce((s, a) => s + a.absentDays, 0),
                tone: 'red' as const,
              },
            ]
          : undefined
      }
    >
      {filterBar}
      <TeamAttendanceExcelTable
        rows={orgRows}
        loading={loading}
        layout="org"
        monthLabel={monthLabel}
        periodMonth={selectedMonth}
        periodYear={selectedYear}
        detailsPath="/admin/attendance/details"
      />
    </AttendancePageChrome>
  );
}
