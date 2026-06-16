import { Suspense } from 'react';
import { EmployeeAttendanceDashboard } from '@/components/attendance/EmployeeAttendanceDashboard';
import { AttendancePeriodProvider } from '@/hooks/useAttendancePeriodUrl';

export default function DbAdminAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Loading…</div>}>
      <AttendancePeriodProvider>
        <EmployeeAttendanceDashboard accent="violet" title="My Attendance" />
      </AttendancePeriodProvider>
    </Suspense>
  );
}
