import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { isRedisEnabled } from '../config/env';

@Injectable()
export class HealthService {
  constructor(
    private config: ConfigService,
    @InjectConnection() private mongoose: Connection,
  ) {}

  getStatus() {
    const dbState = this.mongoose.readyState;
    const dbStatus =
      dbState === 1 ? 'up' : dbState === 2 ? 'connecting' : 'down';

    const redisOn = isRedisEnabled();

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
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
          status: redisOn ? 'up' : 'disabled',
          label: 'Redis / Queues',
          enabled: redisOn,
        },
        elasticsearch: {
          status: this.config.get<boolean>('ELASTICSEARCH_ENABLED', false) ? 'up' : 'disabled',
          label: 'Elasticsearch',
          enabled: this.config.get<boolean>('ELASTICSEARCH_ENABLED', false),
        },
      },
    };
  }
}
