import type { CompanyProductId } from '@/lib/constants/company-products';

export interface AdminNavItem {
  label: string;
  href: string;
  badgeCount?: number;
  /** Sidebar group label — Workspace, Operations, Data */
  section?: string;
  /** Collapsible folder children in the sidebar */
  children?: { label: string; href: string; external?: boolean }[];
}

/** CRM-only sidebar — company products are chosen via login popup, not listed here */
const crmNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', section: 'Workspace' },
  { label: 'Users', href: '/admin/users', section: 'Workspace' },
  { label: 'Master data', href: '/admin/master-data-upload', section: 'Workspace' },
  { label: 'All campaigns', href: '/admin/batches', section: 'Workspace' },
  { label: 'Chat', href: '/admin/chat', section: 'Workspace' },
  { label: 'Team chats', href: '/admin/team-chats', section: 'Workspace' },
  { label: 'Activity logs', href: '/admin/activity-logs', section: 'Operations' },
  { label: 'Attendance', href: '/admin/attendance', section: 'Operations' },
  { label: 'Analytics', href: '/admin/analytics', section: 'Operations' },
  { label: 'QC review', href: '/admin/qc', section: 'Operations' },
  { label: 'Dispositions', href: '/admin/disposition', section: 'Operations' },
  { label: 'Ready QC', href: '/admin/qc/ready', section: 'Operations' },
  { label: 'Leave requests', href: '/admin/leave-apply', section: 'Operations' },
  {
    label: 'Salary',
    href: '/admin/salary',
    section: 'Operations',
    children: [
      { label: 'Payroll setup', href: '/admin/salary-slips' },
      { label: 'Salary slip store', href: '/admin/salary-slips/store' },
    ],
  },
  { label: 'Personal notes', href: '/admin/personal-notes', section: 'Operations' },
  { label: 'Bulk email verify', href: '/admin/bulk-email-verification', section: 'Data' },
  { label: 'Suppression', href: '/admin/suppression-campaigns', section: 'Data' },
  { label: 'Employee data', href: '/admin/employee-data', section: 'Data' },
  { label: 'Duplicates', href: '/admin/duplicates', section: 'Data' },
  { label: 'DB admin data', href: '/admin/master-data-upload/requests', section: 'Data' },
  { label: 'Settings', href: '/admin/settings' },
];

const intentNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/intent-matics', section: 'Workspace' },
  { label: 'Campaigns', href: '/admin/campaigns', section: 'Workspace' },
  { label: 'Leads', href: '/admin/leads', section: 'Workspace' },
  { label: 'Settings', href: '/admin/settings' },
];

const personifiedNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/companies/personified-b2b', section: 'Workspace' },
  { label: 'Leads', href: '/admin/leads', section: 'Workspace' },
  { label: 'Users', href: '/admin/users', section: 'Workspace' },
  { label: 'Settings', href: '/admin/settings' },
];

const quoreItNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/companies/quore-it', section: 'Workspace' },
  { label: 'Users', href: '/admin/users', section: 'Workspace' },
  { label: 'Activity logs', href: '/admin/activity-logs', section: 'Operations' },
  { label: 'Settings', href: '/admin/settings' },
];

export function getAdminNavItems(productId: CompanyProductId | null): AdminNavItem[] {
  switch (productId) {
    case 'quoreb2b-crm':
      return crmNav;
    case 'intent-matics':
      return intentNav;
    case 'personified':
      return personifiedNav;
    case 'quore-it':
      return quoreItNav;
    case 'compare-bazaar':
      return [];
    default:
      return [];
  }
}
