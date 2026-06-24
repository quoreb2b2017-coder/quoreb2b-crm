import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendancePanelProvider } from '@/components/attendance/AttendancePanelContext';
import { employeeNav } from '@/components/employee/employee-nav';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AttendancePanelProvider variant="employee">
        <DashboardLayout title="Employee" variant="employee" navItems={employeeNav}>
          {children}
        </DashboardLayout>
      </AttendancePanelProvider>
    </Suspense>
  );
}
