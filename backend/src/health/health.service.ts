import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { isElasticsearchEnabled, isRedisConfigured } from '../config/env';
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

    const redisConfigured = isRedisConfigured();
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

    const esConfigured = isElasticsearchEnabled();
    let esStatus: 'up' | 'down' | 'disabled' = esConfigured ? 'down' : 'disabled';
    if (esConfigured) {
      const node = this.config.get<string>('ELASTICSEARCH_NODE', 'http://localhost:9200');
      esStatus = (await pingElasticsearch(node)) ? 'up' : 'down';
    }

    const issues: string[] = [];
    if (dbStatus !== 'up') {
      issues.push(
        dbStatus === 'connecting' ? 'MongoDB is still connecting' : 'MongoDB is unavailable',
      );
    }
    if (redisConfigured && redisStatus !== 'up') {
      issues.push(redisDetail ?? 'Redis / BullMQ is unavailable');
    }
    if (esConfigured && esStatus !== 'up') {
      issues.push('Elasticsearch search is unavailable');
    }

    const coreOk = dbStatus === 'up';
    const optionalOk =
      (!redisConfigured || redisStatus === 'up') && (!esConfigured || esStatus === 'up');

    let status: 'ok' | 'degraded' | 'down';
    if (!coreOk) {
      status = dbStatus === 'connecting' ? 'degraded' : 'down';
    } else if (!optionalOk) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    return {
      status,
      issues,
      timestamp: new Date().toISOString(),
      service: 'quoreb2b-crm-api',
      version: '1.0.0',
      buildSha: process.env.BUILD_SHA || null,
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
