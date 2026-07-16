import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const REDIS_OP_TIMEOUT_MS = 1_200;
/** After Redis failures, skip Redis and use memory-only for this window. */
const REDIS_CIRCUIT_COOLDOWN_MS = 30_000;
const REDIS_CIRCUIT_OPEN_AFTER = 2;

/** Shared cache: Redis when available, in-memory L1 fallback. */
@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly prefix: string;
  private redisFailCount = 0;
  private redisCircuitOpenUntil = 0;
  private loggedCircuitOpen = false;

  constructor(
    config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.prefix = config.get<string>('REDIS_CACHE_PREFIX', 'quoreb2b:cache');
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private redisCircuitOpen(): boolean {
    return Date.now() < this.redisCircuitOpenUntil;
  }

  private noteRedisFailure(err: unknown): void {
    this.redisFailCount += 1;
    if (this.redisFailCount < REDIS_CIRCUIT_OPEN_AFTER) return;
    this.redisCircuitOpenUntil = Date.now() + REDIS_CIRCUIT_COOLDOWN_MS;
    if (!this.loggedCircuitOpen) {
      this.loggedCircuitOpen = true;
      this.logger.warn(
        `Redis unavailable — using in-memory cache for ${REDIS_CIRCUIT_COOLDOWN_MS / 1000}s (${
          err instanceof Error ? err.message : err
        })`,
      );
    }
  }

  private noteRedisSuccess(): void {
    this.redisFailCount = 0;
    this.loggedCircuitOpen = false;
  }

  private readMemory(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private writeMemory(key: string, value: string, ttlSeconds: number): void {
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async withRedisTimeout<T>(op: () => Promise<T>): Promise<T | null> {
    if (!this.redis || this.redisCircuitOpen()) return null;
    try {
      const value = await Promise.race([
        op(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis operation timed out')), REDIS_OP_TIMEOUT_MS),
        ),
      ]);
      this.noteRedisSuccess();
      return value;
    } catch (err) {
      this.noteRedisFailure(err);
      this.logger.debug(
        `Redis op skipped: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    const mem = this.readMemory(key);
    if (mem !== null) return mem;

    if (!this.redis || this.redisCircuitOpen()) return null;

    const value = await this.withRedisTimeout(() => this.redis!.get(this.fullKey(key)));
    if (value !== null) {
      this.writeMemory(key, value, 60);
    }
    return value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.writeMemory(key, value, ttlSeconds);

    if (!this.redis || this.redisCircuitOpen()) return;

    await this.withRedisTimeout(() => this.redis!.set(this.fullKey(key), value, ttlSeconds));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /** Cache-aside: return cached value or run loader and store. */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.redis || this.redisCircuitOpen()) return;
    await this.withRedisTimeout(() => this.redis!.del(this.fullKey(key)));
  }

  async delByPrefix(localPrefix: string): Promise<void> {
    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(localPrefix)) {
        this.memory.delete(key);
      }
    }
    if (!this.redis || this.redisCircuitOpen()) return;
    await this.withRedisTimeout(() =>
      this.redis!.delByPattern(`${this.prefix}:${localPrefix}*`),
    );
  }
}
