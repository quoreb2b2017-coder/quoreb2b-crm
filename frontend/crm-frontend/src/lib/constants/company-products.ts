export const COMPANY_PRODUCT_IDS = [
  'quoreb2b-crm',
  'intent-matics',
  'compare-bazaar',
  'personified',
  'quore-it',
] as const;

export type CompanyProductId = (typeof COMPANY_PRODUCT_IDS)[number];

export interface CompanyProduct {
  id: CompanyProductId;
  name: string;
  tagline: string;
  accent: string;
  iconBg: string;
  iconLetter: string;
  /** Where admin lands after picking this product */
  homePath: string;
  external?: boolean;
}

export const COMPANY_PRODUCTS: CompanyProduct[] = [
  {
    id: 'quoreb2b-crm',
    name: 'QuoreB2B CRM',
    tagline: 'Enterprise sales & pipeline',
    accent: 'from-indigo-500 to-blue-600',
    iconBg: 'bg-indigo-600',
    iconLetter: 'Q',
    homePath: '/admin/dashboard',
  },
  {
    id: 'intent-matics',
    name: 'Intent Matics',
    tagline: 'Buyer intent & signals',
    accent: 'from-violet-500 to-purple-600',
    iconBg: 'bg-violet-600',
    iconLetter: 'IM',
    homePath: '/admin/intent-matics',
  },
  {
    id: 'compare-bazaar',
    name: 'Compare Bazaar',
    tagline: 'B2B comparison marketplace',
    accent: 'from-amber-500 to-orange-600',
    iconBg: 'bg-amber-600',
    iconLetter: 'CB',
    homePath: 'https://www.compare-bazaar.com/blog-admin/login',
    external: true,
  },
  {
    id: 'personified',
    name: 'Personified',
    tagline: 'Personalized B2B outreach',
    accent: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-600',
    iconLetter: 'P',
    homePath: '/admin/companies/personified-b2b',
  },
  {
    id: 'quore-it',
    name: 'QuoreIT',
    tagline: 'Infrastructure & ops',
    accent: 'from-slate-600 to-slate-800',
    iconBg: 'bg-slate-700',
    iconLetter: 'IT',
    homePath: '/admin/companies/quore-it',
  },
];

export function getCompanyProduct(id: CompanyProductId | null | undefined) {
  if (!id) return null;
  return COMPANY_PRODUCTS.find((p) => p.id === id) ?? null;
}

export function getProductIdForPath(pathname: string): CompanyProductId | null {
  if (pathname.startsWith('/admin/dashboard') || pathname.startsWith('/admin/users') ||
      pathname.startsWith('/admin/master-data-upload') ||
      pathname.startsWith('/admin/bulk-email-verification') ||
      pathname.startsWith('/admin/batches') ||
      pathname.startsWith('/admin/leads') || pathname.startsWith('/admin/batches') ||
      pathname.startsWith('/admin/activity-logs') ||
      pathname.startsWith('/admin/attendance') ||
      pathname.startsWith('/admin/leave-apply') ||
      pathname.startsWith('/admin/analytics') ||
      pathname.startsWith('/admin/settings')) {
    return 'quoreb2b-crm';
  }
  if (pathname.startsWith('/admin/intent-matics')) return 'intent-matics';
  if (pathname.startsWith('/admin/companies/personified-b2b')) return 'personified';
  if (pathname.startsWith('/admin/companies/quore-it')) return 'quore-it';
  return null;
}
