import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

const SKIP_PATH_PREFIXES = ['/api/v1/health', '/health'];

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly enabled =
    process.env.LOG_HTTP_REQUESTS !== 'false' &&
    process.env.NODE_ENV !== 'test';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    if (SKIP_PATH_PREFIXES.some((p) => url.startsWith(p))) {
      return next.handle();
    }

    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        this.logger.log(`${method} ${url} ${res.statusCode} - ${Date.now() - now}ms`);
      }),
    );
  }
}
