import { Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

const logger = new Logger('RetryOnConflict');

/**
 * Retries `fn` when it fails on a Postgres unique-constraint violation
 * (Prisma P2002) — for the handful of places a value is computed from a
 * "count existing rows, use count+1" read that isn't atomic with the
 * write (slugs, sequential reference ids). Two concurrent requests can
 * both read the same count and then race to insert; whichever loses gets
 * a P2002 here instead of a real error, so it just recomputes and tries
 * again. Anything that isn't P2002 is not something a retry can fix, so
 * it's rethrown immediately for the global filter to handle.
 *
 * `fn` must recompute the racy value on every call — retrying with the
 * exact same input would just hit the same conflict again.
 */
export async function retryOnUniqueConflict<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!isConflict) throw error;

      logger.warn(
        `Unique-constraint conflict, retrying (attempt ${attempt}/${attempts})`,
      );
    }
  }

  throw lastError;
}
