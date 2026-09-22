import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  type PermissionsMetadata,
} from '../decorators/require-permissions.decorator';
import type { Permission } from '../permissions/permissions.constant';

const SUPERADMIN_ROLE_ID = 1;

/** The shape `request.user` will have once real auth populates it. */
export interface RequestUser {
  id: number;
  role: {
    id: number;
    rules: { action: string }[];
  };
}

/**
 * RBAC guard, built and ready but NOT wired into the app yet — no
 * controller in this codebase applies `@UseGuards(PermissionsGuard)`, and
 * it isn't registered as a global `APP_GUARD` in app.module.ts either.
 * Authentication (who `request.user` even is) hasn't been implemented, so
 * enforcing permissions ahead of that would just lock every route.
 *
 * To turn this on later, once an auth guard/middleware populates
 * `request.user` with the shape above:
 *   1. Register this as a global guard (APP_GUARD) in app.module.ts,
 *      after the auth guard.
 *   2. Annotate routes with `@RequirePermissions({ allOf: [...] })` or
 *      `{ anyOf: [...] }` (see require-permissions.decorator.ts).
 *   3. Mark routes that should stay open with `@Public()`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const metadata = this.reflector.getAllAndOverride<PermissionsMetadata>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) return true;

    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated.');
    }

    if (user.role.id === SUPERADMIN_ROLE_ID) return true;

    const granted = new Set(user.role.rules.map((rule) => rule.action));
    const has = (permission: Permission) => granted.has(permission);

    const passesAll = metadata.allOf ? metadata.allOf.every(has) : true;
    const passesAny = metadata.anyOf ? metadata.anyOf.some(has) : true;

    if (!passesAll || !passesAny) {
      throw new ForbiddenException('Missing required permission.');
    }

    return true;
  }
}
