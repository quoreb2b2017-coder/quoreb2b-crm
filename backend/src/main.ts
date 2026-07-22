import './config/env';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { readProcessRole, shouldRunHttp } from './common/utils/process-role.util';
import { initSentry } from './config/sentry.config';
import { isRedisEnabled } from './config/env';
import {
  isLoginIpRestrictionActive,
  parseAllowedLoginIps,
} from './config/login-ip-restriction.util';
import { ensureRedisOrDisable, readRedisEnv, MIN_REDIS_VERSION } from './redis/redis.factory';
import * as clusterRuntime from 'cluster';
import type { Worker } from 'cluster';

const cluster = clusterRuntime as unknown as {
  isPrimary: boolean;
  fork: () => Worker;
  on: (event: 'exit', listener: (worker: Worker, code: number) => void) => void;
};
import { availableParallelism } from 'node:os';

const PRODUCTION_WORKERS = Math.min(
  2,
  Math.max(1, Number(process.env.API_CLUSTER_WORKERS) || availableParallelism() - 1 || 1),
);

async function bootstrap() {
  await ensureRedisOrDisable();

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register());
  app.set('trust proxy', 1);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const config = app.get(ConfigService);

  initSentry(config);

  app.use(helmet());
  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // Increase body size limit for large payloads (e.g. master-data bulk imports)
  app.use(require('express').json({ limit: '100mb' }));
  app.use(require('express').urlencoded({ limit: '100mb', extended: true }));

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS')?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Rows'],
  });

  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    app.get(MetricsInterceptor),
  );

  const port = config.get<number>('PORT', 4000);
  const server = await app.listen(port);
  // Long-running uploads (150MB+): disable request timeout; tune keep-alive for nginx upstream.
  server.requestTimeout = 0;
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 76_000;
  console.log(`API running on port ${port} (PROCESS_ROLE=${readProcessRole()})`);
  if (isLoginIpRestrictionActive()) {
    console.log(
      `Login IP restriction enabled (production): ${parseAllowedLoginIps().join(', ')}`,
    );
  }
  if (isRedisEnabled()) {
    const { host, port: redisPort } = readRedisEnv();
    console.log(`Redis OK (${host}:${redisPort}) — BullMQ queues enabled`);
  } else {
    console.warn(
      'REDIS_ENABLED=false — BullMQ disabled (bulk email verify runs in-process). ' +
        `Need Redis ${MIN_REDIS_VERSION}+ for background queues.`,
    );
  }
}

if (process.env.NODE_ENV === 'production' && PRODUCTION_WORKERS > 1 && cluster.isPrimary && readProcessRole() !== 'worker') {
  console.log(`Starting ${PRODUCTION_WORKERS} API workers (imports on one worker won't block login on the other)…`);
  for (let i = 0; i < PRODUCTION_WORKERS; i += 1) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code) => {
    console.warn(`API worker ${worker.process.pid} exited (code ${code}), restarting…`);
    cluster.fork();
  });
} else {
  void bootstrap();
}
