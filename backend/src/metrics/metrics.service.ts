import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly cacheHits: Counter<string>;
  readonly cacheMisses: Counter<string>;

  constructor(private readonly config: ConfigService) {
    this.httpRequestsTotal = new Counter({
      name: 'quoreb2b_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'quoreb2b_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.cacheHits = new Counter({
      name: 'quoreb2b_cache_hits_total',
      help: 'Redis/L1 cache hits',
      labelNames: ['prefix'],
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: 'quoreb2b_cache_misses_total',
      help: 'Redis/L1 cache misses',
      labelNames: ['prefix'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    if (this.config.get<boolean>('PROMETHEUS_ENABLED', true)) {
      collectDefaultMetrics({ register: this.registry, prefix: 'quoreb2b_' });
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
