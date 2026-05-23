import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(config: ConfigService): void {
  const dsn = config.get<string>('SENTRY_DSN');
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: config.get<string>('SENTRY_ENVIRONMENT'),
    tracesSampleRate: config.get<number>('SENTRY_TRACES_SAMPLE_RATE', 0.1),
    integrations: [nodeProfilingIntegration()],
    profilesSampleRate: 0.1,
  });
}
