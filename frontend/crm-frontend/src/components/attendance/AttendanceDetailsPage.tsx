'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAttendancePeriodUrl } from '@/contexts/AttendancePeriodContext';
import { useYearlyAttendance } from '@/hooks/useYearlyAttendance';
import { ArrowLeft } from 'lucide-react';
import {
  attendanceService,
  type AttendanceAnalytics,
} from '@/lib/api/attendance.service';
import { usersService } from '@/lib/api/users.service';
import { AttendancePeriodControls } from '@/components/attendance/AttendancePeriodControls';
import { AttendancePageChrome } from '@/components/attendance/AttendancePageChrome';
import { AttendancePeriodBody } from '@/components/attendance/AttendancePeriodBody';
import { formatMonthYearLabel } from '@/lib/attendance/month-year';
import { ALL_MONTH_INDICES, sumYearlyByMonths } from '@/lib/attendance/yearly-analytics';
import { buildAttendancePeriodStats } from '@/lib/attendance/build-period-stats';
import {
  EditAttendanceDayModal,
  type EditAttendanceDayRow,
} from '@/components/attendance/EditAttendanceDayModal';
import { cn } from '@/lib/utils/cn';

interface UserDetails {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
}

export function AttendanceDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const isDbAdmin = searchParams.get('from') === 'db-admin';
  const backPath = isDbAdmin ? '/db-admin/attendance' : '/admin/attendance';
  const accent = isDbAdmin ? 'violet' : 'admin';

  const [user, setUser] = useState<UserDetails | null>(null);
  const [monthly, setMonthly] = useState<AttendanceAnalytics | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  const {
    ready,
    view,
    selectedMonth,
    selectedYear,
    selectedMonths,
  } = useAttendancePeriodUrl();

  const isRollup = view === 'yearly' || view === 'custom';
  const rollupMonths = view === 'yearly' ? ALL_MONTH_INDICES : selectedMonths;

  const { yearlyData, yearlyLoading, refetchYearly } = useYearlyAttendance(
    userId,
    selectedYear,
    rollupMonths,
    Boolean(userId) && isRollup,
  );

  const [editRow, setEditRow] = useState<EditAttendanceDayRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthLabel = formatMonthYearLabel(selectedMonth, selectedYear);

  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setUserLoading(true);
    try {
      const userRes = await usersService.getById(userId);
      const userData = userRes.data as Record<string, unknown>;
      setUser({
        id: String(userData.id ?? userData._id ?? ''),
        firstName: String(userData.firstName ?? ''),
        lastName: String(userData.lastName ?? ''),
        email: String(userData.email ?? ''),
        employeeId: userData.employeeId ? String(userData.employeeId) : undefined,
        roles: Array.isArray(userData.roles) ? (userData.roles as string[]) : [],
      });
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setUserLoading(false);
    }
  }, [userId]);

  const fetchMonthly = useCallback(async () => {
    if (!userId || isRollup) return;
    setMonthlyLoading(true);
    try {
      const monthlyRes = await attendanceService.getMonthlyAnalytics(
        userId,
        selectedMonth,
        selectedYear,
        true,
      );
      setMonthly(monthlyRes);
    } catch (error) {
      console.error('Failed to fetch monthly attendance:', error);
    } finally {
      setMonthlyLoading(false);
    }
  }, [userId, selectedMonth, selectedYear, isRollup]);

  useEffect(() => {
    if (!userId) {
      router.replace(backPath);
      return;
    }
    fetchUser();
  }, [userId, fetchUser, router, backPath]);

  useEffect(() => {
    if (!ready || !userId) return;
    if (!isRollup) {
      fetchMonthly();
    }
  }, [ready, userId, fetchMonthly, isRollup]);

  useEffect(() => {
    if (!ready) return;
    if (isRollup) {
      refetchYearly();
    }
  }, [ready, isRollup, selectedYear, view, selectedMonths, refetchYearly]);

  useEffect(() => {
    const onRefresh = () => {
      if (!isRollup) fetchMonthly();
      else refetchYearly();
    };
    window.addEventListener('attendance:refresh', onRefresh);
    window.addEventListener('work-time:refresh', onRefresh);
    return () => {
      window.removeEventListener('attendance:refresh', onRefresh);
      window.removeEventListener('work-time:refresh', onRefresh);
    };
  }, [fetchMonthly, isRollup, refetchYearly]);

  const openMonthFromYearly = (monthIndex: number) => {
    // Navigate back to monthly view for that month
    router.push(`?userId=${userId}${isDbAdmin ? '&from=db-admin' : ''}&view=monthly&month=${monthIndex}&year=${selectedYear}&months=${monthIndex}`);
  };

  const rollupTotals = useMemo(
    () => sumYearlyByMonths(yearlyData, rollupMonths),
    [yearlyData, rollupMonths],
  );

  const pageLoading = userLoading || (isRollup ? yearlyLoading : monthlyLoading);

  if (!userId) return null;

  const stats = buildAttendancePeriodStats(view, monthly, rollupTotals, {
    checkHistoryHref: '#attendance-daily-log',
    yearlyHistoryHref: '#attendance-yearly-grid',
  });

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Attendance details';
  const subtitle = userLoading
    ? 'Loading employee record…'
    : user
      ? [user.email, user.employeeId ? `ID ${user.employeeId}` : null].filter(Boolean).join(' · ')
      : 'User not found';

  const sheetPrefix = user ? `${user.firstName} ${user.lastName}`.trim() : 'Employee';

  return (
    <AttendancePageChrome
      title={displayName}
      subtitle={subtitle}
      accent={accent}
      loading={pageLoading}
      onRefresh={() => {
        if (!isRollup) fetchMonthly();
        else refetchYearly();
      }}
      leading={
        <button
          type="button"
          onClick={() => router.push(backPath)}
          className={cn(
            'rounded-xl border border-white/30 p-2.5 transition-colors hover:bg-white/10',
          )}
          title="Back to team attendance"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      }
      monthControl={<AttendancePeriodControls accent={accent} />}
      stats={ready ? stats : undefined}
    >
      {ready ? (
        <AttendancePeriodBody
          view={view}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedMonths={selectedMonths}
          monthLabel={monthLabel}
          monthlyData={monthly}
          monthlyLoading={monthlyLoading}
          yearlyData={yearlyData}
          yearlyLoading={yearlyLoading}
          rollupTotals={rollupTotals}
          accent={accent}
          checkHistoryHref="#attendance-daily-log"
          dailySheetTitle={`${sheetPrefix} — Daily`}
          yearlySheetTitle={`${sheetPrefix} — ${selectedYear}`}
          canEdit
          onEditRow={(row) => {
            setEditRow(row);
            setEditOpen(true);
          }}
          onSelectMonth={openMonthFromYearly}
        />
      ) : (
        <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />
      )}
      <EditAttendanceDayModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          if (!isRollup) fetchMonthly();
          else refetchYearly();
        }}
        userId={userId}
        row={editRow}
        accent={accent === 'violet' ? 'violet' : 'emerald'}
      />
    </AttendancePageChrome>
  );
}
