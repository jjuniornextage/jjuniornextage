import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, ip } = request;
    const userAgent = request.get('User-Agent') || '';
    const startTime = Date.now();

    // Log request
    this.logger.log(
      `➡️  ${method} ${url} - ${ip} - ${userAgent}`,
    );

    return next.handle().pipe(
      tap(
        (data) => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          const { statusCode } = response;

          // Log successful response
          this.logger.log(
            `⬅️  ${method} ${url} - ${statusCode} - ${duration}ms`,
          );
        },
        (error) => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          const statusCode = error?.status || 500;

          // Log error response
          this.logger.error(
            `❌ ${method} ${url} - ${statusCode} - ${duration}ms - ${error?.message || 'Unknown error'}`,
          );
        },
      ),
    );
  }
}