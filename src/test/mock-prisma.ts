import type { PrismaService } from '../prisma/prisma.service';

const DELEGATE_METHODS = [
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'create',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'groupBy',
  'upsert',
] as const;

const MODELS = [
  'user',
  'organization',
  'organizationSettings',
  'organizationCapacity',
  'ruleCategory',
  'rule',
  'role',
  'tag',
  'project',
  'member',
  'memberInvite',
  'ticket',
  'ticketStarred',
  'ticketAttachment',
  'ticketComment',
  'ticketRequest',
  'requestAttachment',
  'activityLogEntry',
  'idempotencyKey',
] as const;

type MockDelegate = Record<(typeof DELEGATE_METHODS)[number], jest.Mock>;

/**
 * A PrismaService stand-in with every model delegate's common methods
 * stubbed as jest.fn()s (all unconfigured mocks resolve to `undefined`
 * until a test sets a return value). Also provides $transaction, which
 * most services use either as `$transaction([...])` (an array of
 * queries, each already in flight) or `$transaction(async (tx) => ...)`
 * (a callback given a client) — this stub supports both by resolving the
 * array as-is and invoking the callback with the same mock object acting
 * as `tx` (since nothing here actually enforces transactional isolation,
 * there's no meaningful difference between `this.prisma` and `tx` in a
 * unit test).
 */
export function createMockPrisma(): PrismaService & {
  [K in (typeof MODELS)[number]]: MockDelegate;
} {
  const mock = {} as Record<string, unknown>;

  for (const model of MODELS) {
    const delegate = {} as Record<string, jest.Mock>;
    for (const method of DELEGATE_METHODS) {
      delegate[method] = jest.fn();
    }
    mock[model] = delegate;
  }

  mock.$transaction = jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(mock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  return mock as unknown as PrismaService & {
    [K in (typeof MODELS)[number]]: MockDelegate;
  };
}
