import { formatActivityAction } from '@/lib/constants/activity-labels';

const ROLE_CLASS: Record<string, string> = {
  super_admin: 'al-role-pill al-role-pill--super_admin',
  admin: 'al-role-pill al-role-pill--admin',
  db_admin: 'al-role-pill al-role-pill--db_admin',
  employee: 'al-role-pill al-role-pill--employee',
  client: 'al-role-pill al-role-pill--client',
};

const ACTION_CLASS: Record<string, string> = {
  LOGIN: 'al-action-pill al-action-pill--login',
  LOGOUT: 'al-action-pill al-action-pill--logout',
  IDLE_LOGOUT: 'al-action-pill al-action-pill--idle',
  IDLE_WARNING: 'al-action-pill al-action-pill--idle',
  USER_ACTIVE: 'al-action-pill al-action-pill--session',
  LEAD_UPDATE: 'al-action-pill al-action-pill--lead',
  LEAD_TOUCH: 'al-action-pill al-action-pill--lead',
  LEAD_VIEW: 'al-action-pill al-action-pill--lead_view',
  USER_CREATE: 'al-action-pill al-action-pill--user',
  USER_DELETE: 'al-action-pill al-action-pill--danger',
  USER_STATUS_CHANGE: 'al-action-pill al-action-pill--warn',
  MASTER_DATA_UPLOAD: 'al-action-pill al-action-pill--master',
  MASTER_DATA_REPLACE: 'al-action-pill al-action-pill--master',
  BATCH_CREATE: 'al-action-pill al-action-pill--batch',
  BATCH_DELETE: 'al-action-pill al-action-pill--danger',
};

export function roleBadgeClass(role: string): string {
  return ROLE_CLASS[role] ?? 'al-role-pill al-role-pill--default';
}

export function actionBadgeClass(action: string): string {
  if (ACTION_CLASS[action]) return ACTION_CLASS[action];
  if (action.startsWith('MASTER_DATA')) return 'al-action-pill al-action-pill--master';
  if (action.startsWith('LEAD_')) return 'al-action-pill al-action-pill--lead';
  if (action.startsWith('USER_')) return 'al-action-pill al-action-pill--user';
  if (action.startsWith('BATCH_')) return 'al-action-pill al-action-pill--batch';
  if (action.startsWith('IDLE_') || action === 'API_REQUEST') {
    return 'al-action-pill al-action-pill--idle';
  }
  return 'al-action-pill al-action-pill--default';
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
  const hues = ['#2568b8', '#2e7ad1', '#4f46e5', '#0d9488', '#c2410c', '#be185d'];
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
