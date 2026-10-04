import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  RequestUser,
} from '../guards/permissions.guard';

/**
 * Reads `request.user`, populated by JwtStrategy's validate() (see
 * modules/auth/strategies/jwt.strategy.ts) via the global JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
