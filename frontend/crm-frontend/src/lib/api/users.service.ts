import apiClient from './client';

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
  roles: string[];
}

export interface TeamMember {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

function unwrapList<T>(response: { data: unknown }): T[] {
  const body = response.data as { data?: T | T[] };
  const inner = body?.data ?? body;
  if (Array.isArray(inner)) return inner;
  if (inner && typeof inner === 'object' && 'data' in (inner as object)) {
    const nested = (inner as { data: T[] }).data;
    return Array.isArray(nested) ? nested : [];
  }
  return [];
}

export const usersService = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get('/users', { params }),

  /** Employees (or employees + db_admins for admin) — for batch share modal */
  listTeamMembers: async (): Promise<TeamMember[]> => {
    const res = await apiClient.get('/users/team-members');
    const body = res.data as { data?: TeamMember[] };
    return body.data ?? [];
  },

  create: (payload: CreateUserPayload) => apiClient.post('/users', payload),

  getById: (id: string) => apiClient.get(`/users/${id}`),

  getPassword: (id: string) => apiClient.get<{ data: { password: string | null } }>(`/users/${id}/password`),

  setStatus: (id: string, isActive: boolean) =>
    apiClient.patch(`/users/${id}/status`, { isActive }),

  delete: (id: string) => apiClient.delete(`/users/${id}`),
};
