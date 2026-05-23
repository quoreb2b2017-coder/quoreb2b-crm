import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

function flattenExceptionMessage(raw: string | object): string | string[] {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === 'object') {
    const body = raw as Record<string, unknown>;
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.map(String);
    if (typeof body.error === 'string') return body.error;
  }
  return 'Request failed';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message = flattenExceptionMessage(raw);

    this.logger.error(
      `${request.method} ${request.url} - ${status}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error:
        typeof raw === 'object' && raw !== null && 'error' in raw
          ? String((raw as { error?: unknown }).error ?? '')
          : undefined,
    });
  }
}
