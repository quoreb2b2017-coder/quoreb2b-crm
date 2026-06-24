import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { isRedisConfigured } from '../config/env';

const loggers = new Map<string, Logger>();

function loggerFor(label: string): Logger {
  if (!loggers.has(label)) {
    loggers.set(label, new Logger(label));
  }
  return loggers.get(label)!;
}

/** Shared Redis settings for ioredis + BullMQ. */
export function readRedisEnv(): {
  host: string;
  port: number;
  password?: string;
  db: number;
} {
  const password = process.env.REDIS_PASSWORD?.trim();
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: password || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
}

export function buildRedisOptions(config: ConfigService): RedisOptions {
  const password = config.get<string>('REDIS_PASSWORD');
  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: password?.trim() ? password : undefined,
    db: config.get<number>('REDIS_DB', 0),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  };
}

/** Fail-fast client for AppCacheService — do not queue commands while Redis is down. */
export function buildCacheRedisOptions(config: ConfigService): RedisOptions {
  return {
    ...buildRedisOptions(config),
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2_000)),
  };
}

export function buildRedisOptionsFromEnv(): RedisOptions {
  const { host, port, password, db } = readRedisEnv();
  return {
    host,
    port,
    password,
    db,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  };
}

/** Prevents noisy [ioredis] Unhandled error event when Redis is down. */
export function attachRedisErrorHandler(client: Redis, label = 'Redis'): void {
  const log = loggerFor(label);
  let lastMessage = '';
  let lastAt = 0;

  client.on('error', (err: Error) => {
    const msg = err.message || String(err);
    const now = Date.now();
    if (msg === lastMessage && now - lastAt < 30_000) return;
    lastMessage = msg;
    lastAt = now;
    log.warn(
      `${msg} — check REDIS_HOST/PORT, start Redis (docker compose up redis), or set REDIS_ENABLED=false`,
    );
  });
}

export function createRedisClient(config: ConfigService, label = 'Redis'): Redis {
  const client = new Redis(buildCacheRedisOptions(config));
  attachRedisErrorHandler(client, label);
  return client;
}

export const MIN_REDIS_VERSION = '5.0.0';

export function parseRedisVersion(raw: string): number[] {
  return raw.split('.').map((part) => parseInt(part, 10) || 0);
}

export function isRedisVersionSupported(version: string): boolean {
  const current = parseRedisVersion(version);
  const min = parseRedisVersion(MIN_REDIS_VERSION);
  for (let i = 0; i < 3; i += 1) {
    if ((current[i] ?? 0) > (min[i] ?? 0)) return true;
    if ((current[i] ?? 0) < (min[i] ?? 0)) return false;
  }
  return true;
}

async function readRedisServerVersion(client: Redis): Promise<string | null> {
  const info = await client.info('server');
  const match = info.match(/redis_version:(\S+)/);
  return match?.[1] ?? null;
}

export async function pingRedisFromEnv(timeoutMs = 2500): Promise<{
  ok: boolean;
  message: string;
  version?: string;
  versionOk?: boolean;
}> {
  const client = new Redis({
    ...buildRedisOptionsFromEnv(),
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
    retryStrategy: () => null,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  attachRedisErrorHandler(client, 'RedisStartup');
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      return { ok: false, message: String(pong) };
    }
    const version = (await readRedisServerVersion(client)) ?? 'unknown';
    const versionOk = isRedisVersionSupported(version);
    return {
      ok: true,
      message: pong,
      version,
      versionOk,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  } finally {
    client.disconnect();
  }
}

/**
 * Before Nest boot: disable BullMQ when Redis is down or older than 5.x (BullMQ requirement).
 */
export async function ensureRedisOrDisable(): Promise<boolean> {
  if (!isRedisConfigured()) {
    process.env.BULLMQ_ENABLED = 'false';
    return false;
  }

  const ping = await pingRedisFromEnv();
  if (ping.ok && ping.versionOk) {
    process.env.BULLMQ_ENABLED = 'true';
    return true;
  }

  process.env.BULLMQ_ENABLED = 'false';

  if (ping.ok && ping.versionOk === false) {
    console.warn(
      `[Redis] Version ${ping.version} is too old — BullMQ needs Redis ${MIN_REDIS_VERSION}+. ` +
        'Queues run in-process until you upgrade (Memurai Developer).',
    );
    return false;
  }

  console.warn(
    `[Redis] Unreachable (${ping.message}). Queues run in-process. ` +
      'Start Memurai/Redis 5+ or set REDIS_ENABLED=false in .env.',
  );
  return false;
}

export async function pingRedis(config: ConfigService): Promise<{
  ok: boolean;
  message: string;
  version?: string;
  versionOk?: boolean;
}> {
  const password = config.get<string>('REDIS_PASSWORD');
  const client = new Redis({
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: password?.trim() ? password : undefined,
    db: config.get<number>('REDIS_DB', 0),
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    retryStrategy: () => null,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  attachRedisErrorHandler(client, 'RedisHealth');
  try {
    await client.connect();
    const pong = await client.ping();
    const version = (await readRedisServerVersion(client)) ?? 'unknown';
    return {
      ok: pong === 'PONG',
      message: pong,
      version,
      versionOk: isRedisVersionSupported(version),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  } finally {
    client.disconnect();
  }
}
