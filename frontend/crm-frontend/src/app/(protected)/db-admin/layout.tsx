import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendancePanelProvider } from '@/components/attendance/AttendancePanelContext';

const navItems = [
  { label: 'Dashboard', href: '/db-admin/dashboard' },
  { label: 'Batches', href: '/db-admin/batches' },
  { label: 'Master Data', href: '/db-admin/master-data' },
  { label: 'Attendance', href: '/db-admin/attendance' },
  { label: 'Leave Apply', href: '/db-admin/leave-apply' },
  { label: 'Activity Logs', href: '/db-admin/activity-logs' },
  { label: 'Settings', href: '/db-admin/settings' },
];

export default function DbAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AttendancePanelProvider variant="db_admin">
        <DashboardLayout title="Database Admin" variant="db_admin" navItems={navItems}>
          {children}
        </DashboardLayout>
      </AttendancePanelProvider>
    </Suspense>
  );
}
