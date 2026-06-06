import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env before AppModule evaluates (for REDIS_ENABLED, etc.)
config({ path: resolve(process.cwd(), '.env') });

export const isRedisConfigured = (): boolean => process.env.REDIS_ENABLED !== 'false';

/** BullMQ + RedisModule load when configured and startup ping passed. */
export const isRedisEnabled = (): boolean => {
  if (!isRedisConfigured()) return false;
  if (process.env.BULLMQ_ENABLED === 'false') return false;
  return true;
};

/** Leads search index — off by default; set ELASTICSEARCH_ENABLED=true when ES is running. */
export const isElasticsearchEnabled = (): boolean =>
  process.env.ELASTICSEARCH_ENABLED === 'true';
