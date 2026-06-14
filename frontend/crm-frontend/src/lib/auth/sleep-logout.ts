/** Set during sleep/lock logout; must be cleared before a new login session. */
export const SLEEP_LOGOUT_FLAG = 'crm-sleep-logout';
const FRESH_LOGIN_MARKER = 'crm-fresh-login';
const SESSION_ALIVE_KEY = 'crm-session-alive';
const HIDDEN_SINCE_KEY = 'crm-hidden-since';

/**
 * JS timers did not run for this long ⇒ PC sleep / screen lock (timers frozen).
 * Kept below idle timeout so sleep always signs out before 5 min idle.
 */
export const SLEEP_GAP_MS = 25_000;

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

export function touchSessionAlive(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_ALIVE_KEY, String(Date.now()));
}

export function markTabHidden(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(HIDDEN_SINCE_KEY, String(Date.now()));
}

export function clearTabHidden(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(HIDDEN_SINCE_KEY);
}

export function hiddenDurationMs(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  const raw = sessionStorage.getItem(HIDDEN_SINCE_KEY);
  if (!raw) return 0;
  const t = Number(raw);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
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
  return gap > 0 && gap >= thresholdMs;
}

export function markFreshLogin(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(FRESH_LOGIN_MARKER, String(Date.now()));
  clearSleepLogoutFlag();
  clearTabHidden();
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

/** Heartbeat / alive timestamp gap — timers were frozen (sleep or lock). */
export function detectFrozenClockGap(lastTickMs: number, thresholdMs = SLEEP_GAP_MS): boolean {
  if (lastTickMs <= 0) return false;
  return Date.now() - lastTickMs >= thresholdMs;
}
