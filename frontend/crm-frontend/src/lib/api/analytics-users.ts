import { usersService } from './users.service';

export interface AnalyticsUserOption {
  id: string;
  name: string;
  email: string;
  employeeId?: string;
  role: string;
}

function parseUserList(data: unknown): Record<string, unknown>[] {
  const outer = (data as { data?: unknown })?.data;
  if (Array.isArray(outer)) return outer as Record<string, unknown>[];
  if (outer && typeof outer === 'object' && Array.isArray((outer as { data?: unknown[] }).data)) {
    return (outer as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export async function listAnalyticsSubjects(): Promise<AnalyticsUserOption[]> {
  const { data } = await usersService.list({ limit: 500 });
  const list = parseUserList(data);
  return list
    .filter((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      return roles.includes('employee');
    })
    .map((u) => ({
      id: String(u.id ?? u._id),
      name: `${String(u.firstName ?? '')} ${String(u.lastName ?? '')}`.trim() || String(u.email),
      email: String(u.email ?? ''),
      employeeId: u.employeeId ? String(u.employeeId) : undefined,
      role: (Array.isArray(u.roles) ? (u.roles as string[])[0] : '') ?? 'employee',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
