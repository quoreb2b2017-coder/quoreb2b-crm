import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { CSV_IMPORT_ACTIVE_LOCK_KEY } from '../csv-import.constants';

@Injectable()
export class CsvImportLockService {
  private readonly logger = new Logger(CsvImportLockService.name);
  private readonly ttlSeconds = 4 * 60 * 60;

  constructor(private readonly redis: RedisService) {}

  async acquire(masterKey: string, jobId: string): Promise<boolean> {
    const key = `${CSV_IMPORT_ACTIVE_LOCK_KEY}:${masterKey}`;
    const ok = await this.redis.setNx(key, jobId, this.ttlSeconds);
    if (!ok) {
      this.logger.warn(`Import lock busy for ${masterKey}`);
    }
    return ok;
  }

  async release(masterKey: string, jobId: string): Promise<void> {
    const key = `${CSV_IMPORT_ACTIVE_LOCK_KEY}:${masterKey}`;
    const current = await this.redis.get(key);
    if (current === jobId) {
      await this.redis.del(key);
    }
  }
}
