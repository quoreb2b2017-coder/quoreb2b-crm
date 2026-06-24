import type { CompanyProductId } from '@/lib/constants/company-products';

export interface AdminNavItem {
  label: string;
  href: string;
  badgeCount?: number;
}

/** CRM-only sidebar — company products are chosen via login popup, not listed here */
const crmNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'All users', href: '/admin/users' },
  { label: 'Master File', href: '/admin/master-data-upload' },
  { label: 'Suppression', href: '/admin/suppression-campaigns' },
  { label: 'Employee Data', href: '/admin/employee-data' },
  { label: 'DB Admin Data', href: '/admin/master-data-upload/requests' },
  { label: 'Email Verification', href: '/admin/bulk-email-verification' },
  { label: 'Campaigns', href: '/admin/batches' },
  { label: 'All QC', href: '/admin/qc' },
  { label: 'Ready QC', href: '/admin/qc/ready' },
  { label: 'Personal Notes', href: '/admin/personal-notes' },
  { label: 'Attendance', href: '/admin/attendance' },
  { label: 'Leave Requests', href: '/admin/leave-apply' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Activity Logs', href: '/admin/activity-logs' },
  { label: 'Settings', href: '/admin/settings' },
];
    
const intentNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/intent-matics' },
  { label: 'Campaigns', href: '/admin/campaigns' },
  { label: 'Leads', href: '/admin/leads' },
  { label: 'Settings', href: '/admin/settings' },
];

const personifiedNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/companies/personified-b2b' },
  { label: 'Leads', href: '/admin/leads' },
  { label: 'All users', href: '/admin/users' },
  { label: 'Settings', href: '/admin/settings' },
];

const quoreItNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/companies/quore-it' },
  { label: 'All users', href: '/admin/users' },
  { label: 'Activity Logs', href: '/admin/activity-logs' },
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
