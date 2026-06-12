import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendancePanelProvider } from '@/components/attendance/AttendancePanelContext';

const navItems = [
  { label: 'Dashboard', href: '/employee/dashboard' },
  { label: 'Batches', href: '/employee/batches' },
  { label: 'My Data', href: '/employee/my-data' },
  { label: 'Personal Notes', href: '/employee/personal-notes' },
  { label: 'Attendance', href: '/employee/attendance' },
  { label: 'Leave Apply', href: '/employee/leave-apply' },
  { label: 'Activity Logs', href: '/employee/activity-logs' },
  { label: 'Settings', href: '/employee/settings' },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AttendancePanelProvider variant="employee">
        <DashboardLayout title="Employee" variant="employee" navItems={navItems}>
          {children}
        </DashboardLayout>
      </AttendancePanelProvider>
    </Suspense>
  );
}
