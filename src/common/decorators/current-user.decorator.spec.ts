import type { ExecutionContext } from '@nestjs/common';
import { extractCurrentUser } from './current-user.decorator';
import type { RequestUser } from '../guards/permissions.guard';

function makeContext(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('extractCurrentUser', () => {
  it('returns request.user when it is set', () => {
    const user: RequestUser = {
      id: 1,
      email: 'jane@example.com',
      isVerified: true,
      createdViaInvite: false,
    };
    expect(extractCurrentUser(undefined, makeContext(user))).toBe(user);
  });

  it('returns undefined when request.user is unset', () => {
    expect(extractCurrentUser(undefined, makeContext())).toBeUndefined();
  });
});
