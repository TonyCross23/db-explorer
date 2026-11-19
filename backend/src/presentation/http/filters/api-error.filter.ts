import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ExplorerError, DatabaseUnavailableError } from '../../../domain/errors';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof ExplorerError
        ? { NOT_FOUND: 404, INVALID_QUERY: 400, DATABASE_UNAVAILABLE: 502 }[error.code]
        : error instanceof HttpException
          ? error.getStatus()
          : 500;
    const body =
      error instanceof ExplorerError
        ? error.message
        : error instanceof HttpException
          ? error.getResponse()
          : null;
    const message =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'message' in body
          ? body.message
          : 'Something went wrong. Please try again.';
    response.status(status).json({
      error: {
        message,
        ...(error instanceof DatabaseUnavailableError && error.reason
          ? { reason: error.reason }
          : {}),
        ...(body && typeof body === 'object' && 'fields' in body ? { fields: body.fields } : {}),
      },
    });
  }
}
