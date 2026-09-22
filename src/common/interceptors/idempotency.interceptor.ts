import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Honors a client-supplied `Idempotency-Key` header on any
 * POST/PATCH/PUT/DELETE: the first request with a given key runs
 * normally and its response is cached; any later request with the SAME
 * key gets that cached response back instead of the handler running
 * again. Protects against double-submits actually double-creating or
 * double-deleting something — a slow double-click before a button
 * disables, or a client retrying after a response was dropped in
 * transit even though the server-side write already went through.
 *
 * The header is optional — a request without one just runs normally,
 * uncached, so this never breaks a caller that hasn't adopted it.
 * Registered globally via APP_INTERCEPTOR in app.module.ts.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const method = (request.method as string).toUpperCase();

    if (!MUTATING_METHODS.has(method)) return next.handle();

    const key = request.headers['idempotency-key'];
    console.log(key);
    if (!key || typeof key !== 'string') return next.handle();

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) {
      this.logger.log(`Replaying cached response for idempotency key ${key}`);
      const response = context.switchToHttp().getResponse();
      response.status(existing.responseStatus);
      return of(existing.responseBody);
    }

    // Claim the key before running the handler. A unique-constraint
    // violation here means a concurrent request with the same key is
    // already in flight, so this one fails fast instead of racing it.
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          method,
          path: request.originalUrl ?? request.url,
          responseStatus: 0,
          responseBody: Prisma.JsonNull,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A request with this idempotency key is already in progress.',
        );
      }
      throw error;
    }

    try {
      const data = await lastValueFrom(next.handle());
      const response = context.switchToHttp().getResponse();
      await this.prisma.idempotencyKey.update({
        where: { key },
        data: {
          responseStatus: response.statusCode,
          responseBody: data === undefined ? Prisma.JsonNull : data,
        },
      });
      return of(data);
    } catch (error) {
      // Don't leave a permanently-blocking claimed key behind for a
      // request that failed — a legitimate retry with the same key
      // should still be able to go through.
      await this.prisma.idempotencyKey
        .delete({ where: { key } })
        .catch(() => {});
      throw error;
    }
  }
}
