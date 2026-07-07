import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();
    const route = req.route?.path ?? req.path ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () => this.record(req.method, route, res.statusCode, start),
        error: () => this.record(req.method, route, res.statusCode || 500, start),
      }),
    );
  }

  private record(method: string, route: string, status: number, start: bigint): void {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
    this.metrics.httpRequestsTotal.inc({ method, route, status: String(status) });
    this.metrics.httpRequestDuration.observe({ method, route }, elapsed);
  }
}
