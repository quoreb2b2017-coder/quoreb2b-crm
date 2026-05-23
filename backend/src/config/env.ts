import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env before AppModule evaluates (for REDIS_ENABLED, etc.)
config({ path: resolve(process.cwd(), '.env') });

export const isRedisEnabled = (): boolean => process.env.REDIS_ENABLED !== 'false';
