import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AttendancePeriodProvider } from '@/hooks/useAttendancePeriodUrl';

const EmployeeAttendanceDashboard = dynamic(
  () =>
    import('@/components/attendance/EmployeeAttendanceDashboard').then((m) => ({
      default: m.EmployeeAttendanceDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-center text-slate-500">Loading attendance…</div>
    ),
  },
);

export default function EmployeeAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Loading…</div>}>
      <AttendancePeriodProvider>
        <EmployeeAttendanceDashboard />
      </AttendancePeriodProvider>
    </Suspense>
  );
}
