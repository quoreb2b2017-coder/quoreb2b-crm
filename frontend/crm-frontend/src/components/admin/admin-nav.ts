import type { CompanyProductId } from '@/lib/constants/company-products';

export interface AdminNavItem {
  label: string;
  href: string;
}

/** CRM-only sidebar — company products are chosen via login popup, not listed here */
const crmNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Master Data Upload', href: '/admin/master-data-upload' },
  { label: 'Batches', href: '/admin/batches' },
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
  { label: 'Users', href: '/admin/users' },
  { label: 'Settings', href: '/admin/settings' },
];

const quoreItNav: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/companies/quore-it' },
  { label: 'Users', href: '/admin/users' },
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
