import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendancePanelProvider } from '@/components/attendance/AttendancePanelContext';
import { dbAdminNav } from '@/components/db-admin/db-admin-nav';

export default function DbAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AttendancePanelProvider variant="db_admin">
        <DashboardLayout title="Database Admin" variant="db_admin" navItems={dbAdminNav}>
          {children}
        </DashboardLayout>
      </AttendancePanelProvider>
    </Suspense>
  );
}
