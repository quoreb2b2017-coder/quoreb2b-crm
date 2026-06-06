import { createHash } from 'crypto';

/** Stable cache key fragment from any serializable value. */
export function stableHash(value: unknown): string {
  const raw =
    typeof value === 'object' && value !== null
      ? JSON.stringify(value, Object.keys(value as object).sort())
      : JSON.stringify(value);
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function cacheTtlSeconds(config: { get: (k: string, d?: number) => number | undefined }, kind: 'short' | 'medium' | 'long' | 'live'): number {
  switch (kind) {
    case 'live':
      return config.get('REDIS_CACHE_TTL_LIVE_SECONDS', 15) ?? 15;
    case 'short':
      return config.get('REDIS_CACHE_TTL_SECONDS', 60) ?? 60;
    case 'medium':
      return config.get('REDIS_CACHE_TTL_MEDIUM_SECONDS', 180) ?? 180;
    case 'long':
      return config.get('REDIS_CACHE_TTL_LONG_SECONDS', 600) ?? 600;
    default:
      return 60;
  }
}
