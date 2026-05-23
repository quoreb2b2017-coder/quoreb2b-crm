import { Suspense } from 'react';
import { EmployeeAttendanceDashboard } from '@/components/attendance/EmployeeAttendanceDashboard';

export default function EmployeeAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Loading…</div>}>
      <EmployeeAttendanceDashboard />
    </Suspense>
  );
}
