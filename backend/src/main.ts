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
import { initSentry } from './config/sentry.config';
import { isRedisEnabled } from './config/env';
import {
  isLoginIpRestrictionActive,
  parseAllowedLoginIps,
} from './config/login-ip-restriction.util';
import { ensureRedisOrDisable, readRedisEnv, MIN_REDIS_VERSION } from './redis/redis.factory';

async function bootstrap() {
  await ensureRedisOrDisable();

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register());
  app.set('trust proxy', 1);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const config = app.get(ConfigService);

  initSentry(config);

  app.use(helmet());
  app.use(compression());

  // Increase body size limit for large payloads (e.g. master-data bulk imports)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS')?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`API running on port ${port}`);
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

bootstrap();
