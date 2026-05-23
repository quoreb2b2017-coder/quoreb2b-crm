import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { ActivityLogsService } from '../../modules/activity-logs/activity-logs.service';
import { actorFromJwt } from '../../modules/activity-logs/activity-user.util';

const SKIP_PREFIXES = ['/health', '/activity-logs'];
const SKIP_EXACT = new Set(['/api/v1/activity-logs/track']);

/** Routes that log their own rich activity entry — skip generic API duplicate */
const SELF_LOGGED_PATHS = ['/master-data', '/batches'];

function resolveApiAction(method: string, path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.includes('/master-data') && method === 'POST') {
    return 'MASTER_DATA_UPLOAD';
  }
  if (normalized.includes('/master-data') && method === 'DELETE') {
    return 'MASTER_DATA_CLEAR';
  }
  const resource = path.split('/').filter(Boolean).slice(2, 4).join('/') || 'api';
  return `${method}_${resource.replace(/\//g, '_').toUpperCase()}`;
}

@Injectable()
export class ActivityLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLoggingInterceptor.name);

  constructor(private activityLogs: ActivityLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: Record<string, unknown> }>();
    const method = req.method?.toUpperCase() ?? 'GET';

    if (!req.user?.id) {
      return next.handle();
    }

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (SKIP_PREFIXES.some((p) => path.includes(p)) || SKIP_EXACT.has(path)) {
      return next.handle();
    }

    if (SELF_LOGGED_PATHS.some((p) => path.includes(p))) {
      return next.handle();
    }

    const actor = actorFromJwt(req.user as Parameters<typeof actorFromJwt>[0]);
    const action = resolveApiAction(method, path);
    const resource = path.split('/').filter(Boolean).slice(2, 4).join('/') || 'api';

    return next.handle().pipe(
      tap(() => {
        void this.activityLogs
          .logWithActor(actor, {
            action,
            resource: resource || 'api',
            path,
            resourceId: (req.params as { id?: string })?.id,
            metadata: {
              method,
              query: req.query,
              bodyKeys:
                req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
            },
            userAgent: (req.headers['user-agent'] as string) || 'unknown',
            sessionId: req.user?.sessionId as string | undefined,
          })
          .catch((err) => {
            this.logger.warn(`Activity log failed for ${action}: ${err?.message ?? err}`);
          });
      }),
    );
  }
}
