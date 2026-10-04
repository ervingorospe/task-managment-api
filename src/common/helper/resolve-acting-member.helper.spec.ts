import { ForbiddenException } from '@nestjs/common';
import { resolveActingMemberId } from './resolve-acting-member.helper';
import type { PrismaService } from '../../prisma/prisma.service';

describe('resolveActingMemberId', () => {
  it('returns the member id when a matching active member exists', async () => {
    const prisma = {
      member: {
        findFirst: jest.fn().mockResolvedValue({ id: 42 }),
      },
    } as unknown as PrismaService;

    await expect(resolveActingMemberId(prisma, 1, 7)).resolves.toBe(42);
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { orgId: 1, userId: 7, isDeleted: false },
      select: { id: true },
    });
  });

  it('throws ForbiddenException when no matching member exists', async () => {
    const prisma = {
      member: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    await expect(resolveActingMemberId(prisma, 1, 7)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
