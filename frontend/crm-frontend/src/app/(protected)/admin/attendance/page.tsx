import { Suspense } from 'react';
import { EmployeeAttendanceDashboard } from '@/components/attendance/EmployeeAttendanceDashboard';
import { AttendancePeriodProvider } from '@/hooks/useAttendancePeriodUrl';

export default function SuperAdminAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Loading…</div>}>
      <AttendancePeriodProvider>
        <EmployeeAttendanceDashboard />
      </AttendancePeriodProvider>
    </Suspense>
  );
}
