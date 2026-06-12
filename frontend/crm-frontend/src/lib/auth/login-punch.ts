import type { AttendancePunchOnLogin } from '@/types/auth';

export const LOGIN_PUNCH_STORAGE_KEY = 'crm-login-punch';

export type StashedLoginPunch = AttendancePunchOnLogin & {
  checkInAt?: string;
  sessionId?: string;
  /** Gross minutes already logged today before this login (same-day re-login). */
  workTimeTodayGrossMinutes?: number;
};

export function stashLoginPunch(punch: StashedLoginPunch): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(LOGIN_PUNCH_STORAGE_KEY, JSON.stringify(punch));
}

export function peekLoginPunch(): StashedLoginPunch | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(LOGIN_PUNCH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StashedLoginPunch;
  } catch {
    return null;
  }
}

export function consumeLoginPunch(): StashedLoginPunch | null {
  const punch = peekLoginPunch();
  if (punch) clearLoginPunch();
  return punch;
}

export function clearLoginPunch(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(LOGIN_PUNCH_STORAGE_KEY);
}
