const AUTH_COOKIE = 'crm-auth';
const MAX_AGE_DAYS = 7;

export function syncAuthCookie(state: {
  user: unknown;
  isAuthenticated: boolean;
  panel?: string | null;
}) {
  if (typeof document === 'undefined') return;

  const payload = JSON.stringify({
    state: {
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      panel: state.panel ?? null,
    },
    version: 0,
  });

  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(payload)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
