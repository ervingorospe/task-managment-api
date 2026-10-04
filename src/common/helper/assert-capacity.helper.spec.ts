import { ForbiddenException } from '@nestjs/common';
import { assertCapacity } from './assert-capacity.helper';
import type { PrismaService } from '../../prisma/prisma.service';

function mockPrisma(capacity: Record<string, number> | null) {
  return {
    organizationCapacity: {
      findUnique: jest.fn().mockResolvedValue(capacity),
    },
  } as unknown as PrismaService;
}

describe('assertCapacity', () => {
  it('does not throw when under the limit', async () => {
    const prisma = mockPrisma({ members: 10 });
    await expect(
      assertCapacity(prisma, 1, 'members', 5, 'Members'),
    ).resolves.toBeUndefined();
  });

  it('throws ForbiddenException when at the limit', async () => {
    const prisma = mockPrisma({ members: 10 });
    await expect(
      assertCapacity(prisma, 1, 'members', 10, 'Members'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws with a message naming the field and limit', async () => {
    const prisma = mockPrisma({ tags: 5 });
    await expect(assertCapacity(prisma, 1, 'tags', 5, 'Tags')).rejects.toThrow(
      'Tags limit reached (5).',
    );
  });

  it('throws when over the limit, not just at it', async () => {
    const prisma = mockPrisma({ roles: 3 });
    await expect(
      assertCapacity(prisma, 1, 'roles', 4, 'Roles'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('treats a missing capacity row as unlimited', async () => {
    const prisma = mockPrisma(null);
    await expect(
      assertCapacity(prisma, 1, 'projects', 999, 'Projects'),
    ).resolves.toBeUndefined();
  });

  it('treats a null limit on the field as unlimited', async () => {
    const prisma = {
      organizationCapacity: {
        findUnique: jest.fn().mockResolvedValue({ tickets: null }),
      },
    } as unknown as PrismaService;
    await expect(
      assertCapacity(prisma, 1, 'tickets', 999, 'Tickets'),
    ).resolves.toBeUndefined();
  });
});
