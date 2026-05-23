import './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { initSentry } from './config/sentry.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule.register());
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
  const redisOn = config.get<boolean>('REDIS_ENABLED', true);
  console.log(`API running on port ${port}`);
  if (!redisOn) {
    console.warn('REDIS_ENABLED=false — BullMQ queues disabled (email/whatsapp/automation log only)');
  }
}

bootstrap();
