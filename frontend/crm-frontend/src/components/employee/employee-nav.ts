export interface EmployeeNavItem {
  label: string;
  href: string;
  section?: string;
  children?: { label: string; href: string; external?: boolean }[];
}

export const employeeNav: EmployeeNavItem[] = [
  { label: 'Dashboard', href: '/employee/dashboard', section: 'Workspace' },
  { label: 'My campaign', href: '/employee/batches', section: 'Workspace' },
  { label: 'My QC', href: '/employee/qc', section: 'Workspace' },
  { label: 'My data', href: '/employee/my-data', section: 'Workspace' },
  { label: 'Missing data', href: '/employee/missing-data', section: 'Workspace' },
  { label: 'Chat', href: '/employee/chat', section: 'Workspace' },
  { label: 'Personal notes', href: '/employee/personal-notes', section: 'Workspace' },
  { label: 'Attendance', href: '/employee/attendance', section: 'Operations' },
  { label: 'Leave apply', href: '/employee/leave-apply', section: 'Operations' },
  {
    label: 'Salary',
    href: '/employee/salary',
    section: 'Operations',
    children: [{ label: 'My salary slips', href: '/employee/salary-slips' }],
  },
  { label: 'Activity logs', href: '/employee/activity-logs', section: 'Operations' },
  { label: 'Settings', href: '/employee/settings' },
];
