/** Dual-tone CRM palette — sidebar grey + single primary blue */
export const CRM_COLORS = {
  sidebar: '#f0f4f8',
  primary: '#2e7ad1',
  primaryDark: '#2568b8',
  primaryLight: '#e8f1fb',
  content: '#ffffff',
  muted: '#64748b',
} as const;

/** Unified nav/shell theme — same blue for admin, db_admin, employee */
export const CRM_SHELL_THEME = {
  color: CRM_COLORS.primary,
  activeBg: 'bg-[#2e7ad1]/10',
  activeBorder: 'border-[#2e7ad1]',
  activeText: 'text-[#2e7ad1]',
  activeDot: 'bg-[#2e7ad1]',
  badgeBg: 'bg-[#2e7ad1]',
  badgeRing: 'ring-[#2e7ad1]/30',
  headerDot: 'bg-[#2e7ad1]',
  /** Sidebar nav icons — brand blue at rest + darker on hover */
  iconText: 'text-[#2e7ad1]',
  iconHover: 'group-hover:text-[#2568b8]',
} as const;
