/** Set during sleep/lock logout; must be cleared before a new login session. */
export const SLEEP_LOGOUT_FLAG = 'crm-sleep-logout';
const FRESH_LOGIN_MARKER = 'crm-fresh-login';

export function setSleepLogoutFlag(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SLEEP_LOGOUT_FLAG, String(Date.now()));
}

export function clearSleepLogoutFlag(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SLEEP_LOGOUT_FLAG);
}

export function hasSleepLogoutFlag(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(SLEEP_LOGOUT_FLAG) != null;
}

/** Marks a successful login so stale sleep flags cannot force an immediate re-logout. */
export function markFreshLogin(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(FRESH_LOGIN_MARKER, String(Date.now()));
}

export function isRecentFreshLogin(maxAgeMs = 8000): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const raw = sessionStorage.getItem(FRESH_LOGIN_MARKER);
  if (!raw) return false;
  const age = Date.now() - Number(raw);
  return Number.isFinite(age) && age >= 0 && age < maxAgeMs;
}

/** True when the page was opened via browser refresh (not sleep return). */
export function isHardPageReload(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === 'reload') return true;
  // Legacy API (deprecated but still present in some browsers)
  const perf = performance as Performance & { navigation?: { type?: number } };
  return perf.navigation?.type === 1;
}
