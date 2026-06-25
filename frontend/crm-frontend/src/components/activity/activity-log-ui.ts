import { formatActivityAction } from '@/lib/constants/activity-labels';

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-gradient-to-r from-slate-700 to-slate-800 text-white ring-1 ring-slate-600/40',
  admin: 'bg-violet-100 text-[#2568b8] ring-1 ring-violet-200',
  db_admin: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  employee: 'bg-emerald-100 text-[#2568b8] ring-1 ring-emerald-200',
  client: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
};

const ACTION_BADGE: Record<string, string> = {
  LOGIN: 'bg-emerald-50 text-[#2568b8] ring-1 ring-emerald-200',
  LOGOUT: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  IDLE_LOGOUT: 'bg-orange-50 text-orange-800 ring-1 ring-orange-200',
  LEAD_UPDATE: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  LEAD_TOUCH: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  LEAD_VIEW: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
  USER_CREATE: 'bg-violet-50 text-[#2568b8] ring-1 ring-violet-200',
  USER_DELETE: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  USER_STATUS_CHANGE: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  MASTER_DATA_UPLOAD: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200',
  MASTER_DATA_REPLACE: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100',
  BATCH_CREATE: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200',
  BATCH_DELETE: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

export function roleBadgeClass(role: string): string {
  return ROLE_BADGE[role] ?? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
}

/** Shared pill styles — always single line, no wrap */
export const BADGE_PILL_BASE =
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold leading-none tracking-tight';

export const ROLE_BADGE_PILL = `${BADGE_PILL_BASE} al-role-badge shadow-sm`;

export const ACTION_BADGE_PILL = `${BADGE_PILL_BASE} al-action-badge shadow-sm`;

export function actionBadgeClass(action: string): string {
  if (ACTION_BADGE[action]) return ACTION_BADGE[action];
  if (action.startsWith('MASTER_DATA')) {
    return 'bg-teal-50 text-teal-800 ring-1 ring-teal-200';
  }
  if (action.startsWith('LEAD_')) {
    return 'bg-blue-50 text-blue-800 ring-1 ring-blue-200';
  }
  if (action.startsWith('USER_')) {
    return 'bg-violet-50 text-[#2568b8] ring-1 ring-violet-200';
  }
  if (action.startsWith('BATCH_')) {
    return 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200';
  }
  return 'bg-[#e2efda] text-[#2e7ad1] ring-1 ring-emerald-200';
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || name === 'Unknown') return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hues = ['#2e7ad1', '#2e75b6', '#7c3aed', '#0d9488', '#c2410c', '#be185d'];
  return hues[Math.abs(hash) % hues.length];
}

export function splitDateTime(formatted?: string): { date: string; time: string } {
  if (!formatted) return { date: '—', time: '' };
  const comma = formatted.lastIndexOf(',');
  if (comma === -1) return { date: formatted, time: '' };
  return {
    date: formatted.slice(0, comma).trim(),
    time: formatted.slice(comma + 1).trim(),
  };
}

export function topActionLabel(action?: string): string {
  if (!action) return '—';
  return formatActivityAction(action);
}

export type UserPickerOption = { id: string; label: string };

export function parseUserPickerOptions(users: Record<string, unknown>[]): UserPickerOption[] {
  return users
    .map((u) => {
      const id = String(u.id ?? u._id ?? '');
      const first = String(u.firstName ?? '').trim();
      const last = String(u.lastName ?? '').trim();
      const name = `${first} ${last}`.trim();
      const email = String(u.email ?? '').trim();
      const employeeId = u.employeeId ? String(u.employeeId).trim() : '';
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      const roleKey = roles[0] ?? '';

      let label = name || email || employeeId || id;
      if (employeeId && name) label = `${name} · ${employeeId}`;
      else if (email && name) label = `${name} (${email})`;

      if (roleKey === 'super_admin' || roleKey === 'admin') label = `${label} — Super Admin`;
      else if (roleKey === 'db_admin') label = `${label} — DB Admin`;
      else if (roleKey === 'employee') label = `${label} — Employee`;

      return { id, label };
    })
    .filter((u) => u.id)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
