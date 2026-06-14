/** Set during sleep/lock logout; must be cleared before a new login session. */
export const SLEEP_LOGOUT_FLAG = 'crm-sleep-logout';
const FRESH_LOGIN_MARKER = 'crm-fresh-login';
const SESSION_ALIVE_KEY = 'crm-session-alive';

/**
 * JS timers frozen this long ⇒ real sleep / screen lock (not a normal tab switch).
 * Tab switches do NOT logout — only clock freeze (Page Lifecycle) or this gap on resume.
 */
export const SLEEP_GAP_MS = 90_000;

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

/** Updated while the portal tab is active. Survives reload after sleep. */
export function touchSessionAlive(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_ALIVE_KEY, String(Date.now()));
}

export function clearSessionAlive(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SESSION_ALIVE_KEY);
}

export function sessionIdleGapMs(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  const raw = sessionStorage.getItem(SESSION_ALIVE_KEY);
  if (!raw) return 0;
  const t = Number(raw);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
}

export function shouldLogoutStaleSession(thresholdMs = SLEEP_GAP_MS): boolean {
  const gap = sessionIdleGapMs();
  return gap > 0 && gap > thresholdMs;
}

/** Marks a successful login so stale sleep flags cannot force an immediate re-logout. */
export function markFreshLogin(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(FRESH_LOGIN_MARKER, String(Date.now()));
  clearSleepLogoutFlag();
  touchSessionAlive();
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
  const perf = performance as Performance & { navigation?: { type?: number } };
  return perf.navigation?.type === 1;
}

/** Timers were frozen (sleep/lock) — not just a background tab throttle. */
export function detectFrozenClockGap(lastTickMs: number, thresholdMs = SLEEP_GAP_MS): boolean {
  if (lastTickMs <= 0) return false;
  return Date.now() - lastTickMs >= thresholdMs;
}
