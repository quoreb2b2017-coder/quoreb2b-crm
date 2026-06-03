const ROLE_LOCAL_PARTS = new Set([
  'info',
  'support',
  'admin',
  'sales',
  'contact',
  'hr',
  'careers',
  'help',
  'office',
  'team',
  'marketing',
  'billing',
  'accounts',
  'service',
  'noreply',
  'no-reply',
  'donotreply',
  'webmaster',
  'postmaster',
  'abuse',
  'jobs',
  'recruiting',
  'recruitment',
  'press',
  'media',
  'hello',
  'enquiries',
  'inquiry',
  'customerservice',
  'customer.service',
]);

export function isRoleBasedEmail(localPart: string): boolean {
  const base = localPart.split('+')[0].toLowerCase();
  if (ROLE_LOCAL_PARTS.has(base)) return true;
  if (base.startsWith('info.') || base.startsWith('support.')) return true;
  return false;
}

export function listRolePrefixes(): string[] {
  return Array.from(ROLE_LOCAL_PARTS);
}
