import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  422: 'VALIDATION_FAILED', 429: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODES[status] ?? 'ERROR';
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as { message?: string | string[]; code?: string; error?: string };
        if (Array.isArray(b.message)) {
          code = 'VALIDATION_FAILED';
          message = 'Validation failed';
          details = b.message;
        } else message = b.message ?? b.error ?? message;
        if (b.code) code = b.code;
      }
    } else if ((exception as any)?.name === 'ValidationError' || (exception as any)?.code === 11000) {
      // Mongoose validation / duplicate key
      status = (exception as any).code === 11000 ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      code = status === 409 ? 'CONFLICT' : 'VALIDATION_FAILED';
      message = status === 409 ? 'A record with these details already exists' : 'Validation failed';
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
  }
}
