import { PermissionsService } from './permissions.service';
import type { PrismaService } from '../../prisma/prisma.service';

function makeService(findFirst: jest.Mock) {
  const prisma = { member: { findFirst } } as unknown as PrismaService;
  return new PermissionsService(prisma);
}

describe('PermissionsService.getMembership', () => {
  it('returns null when the user has no active membership in the org', async () => {
    const service = makeService(jest.fn().mockResolvedValue(null));
    await expect(service.getMembership(1, 2)).resolves.toBeNull();
  });

  it('resolves the membership with a flattened rule set', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 10,
      roleId: 20,
      role: {
        rules: [{ action: 'ticket.view' }, { action: 'ticket.add' }],
      },
    });
    const service = makeService(findFirst);

    const result = await service.getMembership(1, 2);

    expect(result).toEqual({
      memberId: 10,
      roleId: 20,
      rules: new Set(['ticket.view', 'ticket.add']),
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 1, orgId: 2, isActive: true, isDeleted: false },
      select: {
        id: true,
        roleId: true,
        role: { select: { rules: { select: { action: true } } } },
      },
    });
  });

  it('returns an empty rule set for a role with no rules', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 10,
      roleId: 20,
      role: { rules: [] },
    });
    const service = makeService(findFirst);

    const result = await service.getMembership(1, 2);
    expect(result?.rules.size).toBe(0);
  });
});
