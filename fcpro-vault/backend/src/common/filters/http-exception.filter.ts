import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.buildResponseBody(exceptionResponse, status);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message: body.message,
      error: body.error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private buildResponseBody(
    exceptionResponse: string | object | undefined,
    status: number,
  ): Required<Pick<ErrorResponseBody, 'message' | 'error'>> {
    if (typeof exceptionResponse === 'string') {
      return {
        message: exceptionResponse,
        error: this.defaultError(status),
      };
    }

    if (
      exceptionResponse !== null &&
      typeof exceptionResponse === 'object'
    ) {
      const responseBody = exceptionResponse as ErrorResponseBody;

      return {
        message: responseBody.message ?? this.defaultMessage(status),
        error: responseBody.error ?? this.defaultError(status),
      };
    }

    return {
      message: this.defaultMessage(status),
      error: this.defaultError(status),
    };
  }

  private defaultMessage(status: number): string {
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal server error'
      : 'Request failed';
  }

  private defaultError(status: number): string {
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal Server Error'
      : 'Error';
  }
}
