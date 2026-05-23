import { authService } from '@/lib/api/auth.service';
import type { AuthTokens, LoginPanel, User } from '@/types/auth';

function unwrapApiData<T>(response: { data: unknown }): T {
  const body = response.data as Record<string, unknown>;
  if (body && typeof body === 'object' && 'data' in body && body.success !== false) {
    return body.data as T;
  }
  return body as T;
}

export async function loginWithEmail(email: string, password: string): Promise<AuthTokens> {
  const { data } = await authService.login({ email, password });
  const payload = unwrapApiData<AuthTokens>({ data });
  if (!payload?.accessToken || !payload?.user) {
    throw new Error('Invalid server response');
  }
  return payload;
}

export async function loginWithEmployeeId(
  employeeId: string,
  password: string,
): Promise<AuthTokens> {
  const { data } = await authService.loginByEmployeeId({ employeeId, password });
  const payload = unwrapApiData<AuthTokens>({ data });
  if (!payload?.accessToken || !payload?.user) {
    throw new Error('Invalid server response');
  }
  return payload;
}

export async function requestAdminOtp(email: string): Promise<{ devOtp?: string }> {
  const { data } = await authService.sendOtp({ email });
  return unwrapApiData<{ message: string; devOtp?: string }>({ data });
}

export async function loginWithOtp(email: string, otp: string): Promise<AuthTokens> {
  const { data } = await authService.verifyOtp({ email, otp });
  const payload = unwrapApiData<AuthTokens>({ data });
  if (!payload?.accessToken || !payload?.user) {
    throw new Error('Invalid server response');
  }
  return payload;
}

export function getDashboardPath(panel: LoginPanel): string {
  switch (panel) {
    case 'admin':
      return '/admin';
    case 'db_admin':
      return '/db-admin/dashboard';
    case 'employee':
      return '/employee/dashboard';
  }
}

export function resolvePanelFromUser(user: User): LoginPanel {
  if (user.panel) return user.panel as LoginPanel;
  if (user.roles.includes('db_admin')) return 'db_admin';
  if (user.roles.includes('employee')) return 'employee';
  return 'admin';
}
