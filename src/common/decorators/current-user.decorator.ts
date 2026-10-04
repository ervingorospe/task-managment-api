import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  RequestUser,
} from '../guards/permissions.guard';

// Exported separately so it can be unit-tested directly — a
// createParamDecorator()-wrapped function can't be invoked like a plain
// function in a test.
export function extractCurrentUser(
  _data: unknown,
  ctx: ExecutionContext,
): RequestUser | undefined {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
}

/**
 * Reads `request.user`, populated by JwtStrategy's validate() (see
 * modules/auth/strategies/jwt.strategy.ts) via the global JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(extractCurrentUser);
