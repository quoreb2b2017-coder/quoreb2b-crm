import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { isRedisConfigured } from '../config/env';
import { pingRedis, MIN_REDIS_VERSION } from '../redis/redis.factory';

async function pingElasticsearch(node: string): Promise<boolean> {
  try {
    const url = node.replace(/\/$/, '');
    const res = await fetch(`${url}/_cluster/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

@Injectable()
export class HealthService {
  constructor(
    private config: ConfigService,
    @InjectConnection() private mongoose: Connection,
  ) {}

  async getStatus() {
    const dbState = this.mongoose.readyState;
    const dbStatus =
      dbState === 1 ? 'up' : dbState === 2 ? 'connecting' : 'down';

    const redisConfigured = this.config.get<boolean>('REDIS_ENABLED', true);
    let redisStatus: 'up' | 'down' | 'disabled' = redisConfigured ? 'down' : 'disabled';
    let redisDetail: string | undefined;
    let redisEnabled = redisConfigured;

    if (redisConfigured) {
      const ping = await pingRedis(this.config);
      if (ping.ok && ping.versionOk !== false) {
        redisStatus = 'up';
        redisEnabled = true;
      } else if (!ping.ok) {
        redisStatus = 'down';
        redisDetail = ping.message;
      } else {
        redisStatus = 'down';
        redisDetail = `Redis ${ping.version} — need ${MIN_REDIS_VERSION}+ for BullMQ`;
      }
    }

    const queuesActive = isRedisConfigured() && redisStatus === 'up';

    const esConfigured = this.config.get<boolean>('ELASTICSEARCH_ENABLED', false);
    let esStatus: 'up' | 'down' | 'disabled' = esConfigured ? 'down' : 'disabled';
    if (esConfigured) {
      const node = this.config.get<string>('ELASTICSEARCH_NODE', 'http://localhost:9200');
      esStatus = (await pingElasticsearch(node)) ? 'up' : 'down';
    }

    const overallOk =
      dbStatus === 'up' &&
      (!redisConfigured || redisStatus === 'up') &&
      (!esConfigured || esStatus === 'up');

    return {
      status: overallOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'quoreb2b-crm-api',
      version: '1.0.0',
      checks: {
        api: { status: 'up', label: 'API Server' },
        database: {
          status: dbStatus,
          label: 'MongoDB',
          state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown',
        },
        redis: {
          status: redisStatus,
          label: 'Redis / Queues',
          enabled: redisEnabled,
          queuesActive,
          ...(redisDetail ? { error: redisDetail } : {}),
        },
        elasticsearch: {
          status: esStatus,
          label: 'Elasticsearch (Leads search)',
          enabled: esConfigured,
        },
      },
    };
  }
}
