import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../guards/permissions.guard';

/**
 * Reads `request.user`, wherever it ends up coming from (session, JWT
 * middleware, etc.) once auth is implemented. Returns `undefined` today
 * since nothing populates `request.user` yet — safe to add to a handler
 * signature ahead of time.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
