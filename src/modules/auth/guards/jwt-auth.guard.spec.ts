import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

// The passport-backed base class JwtAuthGuard extends — spying on it here
// (rather than importing AuthGuard('jwt') fresh) targets the exact
// prototype in jwt-auth.guard.ts's own inheritance chain, and avoids
// @nestjs/passport's ESM-only build tripping up Jest's CJS transform.
const basePrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
  canActivate: (context: ExecutionContext) => unknown;
};

describe('JwtAuthGuard', () => {
  it('allows a @Public() route through without invoking passport', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superSpy = jest.spyOn(basePrototype, 'canActivate');

    expect(guard.canActivate(makeContext())).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it('delegates to the passport jwt strategy for a non-public route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superSpy = jest
      .spyOn(basePrototype, 'canActivate')
      .mockReturnValue(true);

    const context = makeContext();
    expect(guard.canActivate(context)).toBe(true);
    expect(superSpy).toHaveBeenCalledWith(context);
    superSpy.mockRestore();
  });
});
