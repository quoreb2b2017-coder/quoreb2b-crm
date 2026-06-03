/** Env/config values are often strings — coerce before passing to Node APIs (net timeout, etc.). */
export function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  const parsed = parseInt(String(value ?? '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}
