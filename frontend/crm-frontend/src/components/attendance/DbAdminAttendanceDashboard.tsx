'use client';

import { useEffect, useState, useCallback } from 'react';
import { attendanceService, type AttendanceAnalytics, type YearlyAnalytics } from '@/lib/api/attendance.service';
import { usersService, type TeamMember as ApiTeamMember } from '@/lib/api/users.service';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { TeamAttendanceExcelTable, type TeamAttendanceRow } from '@/components/attendance/TeamAttendanceExcelTable';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';
import { workTimeService } from '@/lib/api/work-time.service';

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
}

interface TeamAnalytics {
  userId: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  attendancePercentage: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseUserList(data: unknown): Record<string, unknown>[] {
  const outer = (data as { data?: unknown })?.data;
  if (Array.isArray(outer)) return outer;
  if (outer && typeof outer === 'object' && Array.isArray((outer as { data: unknown[] }).data)) {
    return (outer as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export function DbAdminAttendanceDashboard() {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics[]>([]);
  const [myMonthly, setMyMonthly] = useState<AttendanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [workTimeByUser, setWorkTimeByUser] = useState<Record<string, string>>({});

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const monthLabel = `${MONTHS[selectedMonth - 1]} ${selectedYear}`;

  const fetchTeamData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [usersRes, myData] = await Promise.all([
        usersService.listTeamMembers(),
        attendanceService.getMonthlyAnalytics(user.id, selectedMonth, selectedYear),
      ]);
      setMyMonthly(myData);
      const members: TeamMember[] = usersRes
        .filter((u: ApiTeamMember) => u.roles?.includes('employee'))
        .map((u) => ({
          id: u.id,
          firstName: u.firstName ?? '',
          lastName: u.lastName ?? '',
          email: u.email,
        }));
      setTeamMembers(members);
      if (members.length > 0) {
        const userIds = members.map((m) => m.id);
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
      console.error('Failed to fetch team data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  useEffect(() => {
    if (!selectedUserId) {
      setYearlyData([]);
      return;
    }
    attendanceService.getYearlyAnalytics(selectedUserId, selectedYear).then(setYearlyData).catch(console.error);
  }, [selectedUserId, selectedYear]);

  const teamRows: TeamAttendanceRow[] = teamMembers.map((member) => {
    const analytics = teamAnalytics.find((a) => a.userId === member.id);
    return {
      userId: member.id,
      name: `${member.firstName} ${member.lastName}`.trim(),
      employeeId: member.employeeId,
      email: member.email,
      presentDays: analytics?.presentDays ?? 0,
      absentDays: analytics?.absentDays ?? 0,
      leaveDays: analytics?.leaveDays ?? 0,
      attendancePercentage: analytics?.attendancePercentage ?? 0,
      monthlyWorkFormatted: workTimeByUser[member.id] ?? '—',
    };
  });

  const selectedMember = teamMembers.find((m) => m.id === selectedUserId);

  if (!user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const monthControl = (
    <>
      <label className="text-sm font-medium text-slate-600">Month</label>
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/40"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <label className="text-sm font-medium text-slate-600">Year</label>
      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/40"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <span className="ml-auto text-xs font-medium text-slate-400">{monthLabel}</span>
    </>
  );

  const myStats = myMonthly
    ? [
        { label: 'My Present', value: myMonthly.presentDays, tone: 'green' as const },
        { label: 'My Absent', value: myMonthly.absentDays, tone: 'red' as const },
        { label: 'Team size', value: teamMembers.length, tone: 'neutral' as const },
        {
          label: 'Team avg %',
          value:
            teamAnalytics.length > 0
              ? `${Math.round(teamAnalytics.reduce((s, a) => s + a.attendancePercentage, 0) / teamAnalytics.length)}%`
              : '—',
          tone: 'blue' as const,
        },
      ]
    : undefined;

  return (
    <AttendancePageChrome
      title="Attendance"
      subtitle="Your sheet + team overview — open forms from sidebar Quick actions"
      accent="violet"
      loading={loading}
      onRefresh={fetchTeamData}
      monthControl={monthControl}
      stats={myStats}
    >
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">My daily log</h2>
        <AttendanceDailyExcelGrid
          rows={myMonthly?.dailyBreakdown ?? []}
          loading={loading}
          sheetTitle="My Daily Attendance"
          monthLabel={monthLabel}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Team overview</h2>
        <TeamAttendanceExcelTable
          rows={teamRows}
          loading={loading}
          monthLabel={monthLabel}
          selectedUserId={selectedUserId}
          onSelectMember={setSelectedUserId}
          detailsPath="/db-admin/attendance/details"
        />
      </section>

      {selectedMember && yearlyData.length > 0 && (
        <ExcelSheetShell
          title={`${selectedMember.firstName} ${selectedMember.lastName} — ${selectedYear}`}
          rowCount={yearlyData.length}
        >
          <div className="overflow-x-auto bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Month', 'Present', 'Absent', 'Leave', '%'].map((h) => (
                    <th key={h} className="border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearlyData.map((month) => (
                  <tr key={month.month} className="even:bg-[#fafafa]">
                    <td className="border border-[#e0e0e0] px-2 py-1">{month.month}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center">{month.presentDays}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center">{month.absentDays}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center">{month.leaveDays}</td>
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
