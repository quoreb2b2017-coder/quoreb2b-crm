import { Suspense } from 'react';
import { AttendanceDetailsPage } from '@/components/attendance/AttendanceDetailsPage';
import { AttendancePeriodProvider } from '@/contexts/AttendancePeriodContext';

export default function DbAdminAttendanceDetailsRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Loading…</div>}>
      <AttendancePeriodProvider>
        <AttendanceDetailsPage />
      </AttendancePeriodProvider>
    </Suspense>
  );
}
