import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const LOCK_KEY = 'master:import:active';
const LOCK_TTL_SECONDS = 14_400; // 4h — max import duration

/**
 * Cluster-wide lock so only one heavy master-data import runs at a time
 * (prevents dual t3.large workers from OOM-blocking login).
 */
@Injectable()
export class MasterDataImportLockService {
  constructor(@Optional() private readonly redis?: RedisService) {}

  async acquire(jobId: string): Promise<boolean> {
    if (!this.redis) return true;
    return this.redis.setNx(LOCK_KEY, jobId, LOCK_TTL_SECONDS);
  }

  async currentOwner(): Promise<string | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.get(LOCK_KEY);
    } catch {
      return null;
    }
  }

  async release(jobId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const current = await this.redis.get(LOCK_KEY);
      if (current === jobId) {
        await this.redis.del(LOCK_KEY);
      }
    } catch {
      /* non-blocking */
    }
  }
}
