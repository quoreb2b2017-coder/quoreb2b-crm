import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '../../redis/app-cache.service';
import {
  DomainMxCacheStore,
  DomainMxResult,
} from './utils/domain-validation.util';

@Injectable()
export class DomainMxCacheService implements DomainMxCacheStore {
  constructor(
    private readonly cache: AppCacheService,
    private readonly config: ConfigService,
  ) {}

  private key(domain: string): string {
    return `mx:${domain}`;
  }

  async get(domain: string): Promise<DomainMxResult | null> {
    return this.cache.getJson<DomainMxResult>(this.key(domain));
  }

  async set(domain: string, result: DomainMxResult, ttlMs: number): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await this.cache.setJson(this.key(domain), result, ttlSeconds);
  }

  getPositiveTtlMs(): number {
    return this.config.get<number>('BULK_EMAIL_DOMAIN_CACHE_TTL_MS', 3_600_000);
  }

  getNegativeTtlMs(): number {
    return this.config.get<number>('BULK_EMAIL_DNS_NEGATIVE_CACHE_TTL_MS', 300_000);
  }
}
