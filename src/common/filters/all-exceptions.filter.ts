import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

const PRISMA_ERROR_MAP: Record<string, { status: number; error: string }> = {
  // Unique constraint violation.
  P2002: { status: HttpStatus.CONFLICT, error: 'Conflict' },
  // Record not found (update/delete on a missing row).
  P2025: { status: HttpStatus.NOT_FOUND, error: 'Not Found' },
  // Foreign key constraint failed.
  P2003: { status: HttpStatus.BAD_REQUEST, error: 'Bad Request' },
  // Required related record not found.
  P2018: { status: HttpStatus.BAD_REQUEST, error: 'Bad Request' },
};

/**
 * Catches everything that escapes a controller/service — thrown
 * HttpExceptions, raw Prisma errors, and any other unexpected exception —
 * and turns it into a consistent JSON error response instead of an
 * unhandled rejection that could take the process down. Registered
 * globally in main.ts via `app.useGlobalFilters(new AllExceptionsFilter())`.
 *
 * This is the NestJS equivalent of "middleware/decorator that catches
 * errors everywhere": a per-route try/catch would have to be repeated on
 * every handler, where a single global filter covers all of them (plus
 * guards and pipes) in one place.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const body = this.toErrorBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${body.statusCode} ${body.error}: ${JSON.stringify(body.message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${body.statusCode} ${body.error}: ${JSON.stringify(body.message)}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { statusCode: status, error: exception.name, message: payload };
      }

      const asRecord = payload as Record<string, unknown>;
      return {
        statusCode: status,
        error: (asRecord.error as string) ?? exception.name,
        message: (asRecord.message as string | string[]) ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_MAP[exception.code];
      if (mapped) {
        return {
          statusCode: mapped.status,
          error: mapped.error,
          message: this.describePrismaError(exception),
        };
      }
      // An unmapped Prisma code is still a data-layer bug worth a 500, but
      // never a raw Prisma error message straight to the client.
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid data sent to the database.',
      };
    }

    // Anything else — a plain thrown Error, a typo, whatever. Never leak
    // its message or stack to the client; the full detail still goes to
    // the server log above.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    };
  }

  private describePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(
          ', ',
        );
        return target
          ? `A record with this ${target} already exists.`
          : 'This record already exists.';
      }
      case 'P2025':
        return 'Record not found.';
      case 'P2003':
        return 'This references a record that does not exist.';
      case 'P2018':
        return 'A required related record was not found.';
      default:
        return 'Something went wrong.';
    }
  }
}
