import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('RoleService', () => {
  describe('categories/roles', () => {
    it('lists rule categories with their rules, ordered by name', async () => {
      const prisma = createMockPrisma();
      prisma.ruleCategory.findMany.mockResolvedValue([]);
      const service = new RoleService(prisma);

      await service.categories();

      expect(prisma.ruleCategory.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { rules: true },
      });
    });

    it('lists non-deleted roles for the org with their rules', async () => {
      const prisma = createMockPrisma();
      prisma.role.findMany.mockResolvedValue([]);
      const service = new RoleService(prisma);

      await service.roles(5);

      expect(prisma.role.findMany).toHaveBeenCalledWith({
        where: { orgId: 5, isDeleted: false },
        orderBy: { roleName: 'asc' },
        include: { rules: true },
      });
    });
  });

  describe('create', () => {
    it('throws when an active role with the same name exists', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce(null) // existingDeleted
        .mockResolvedValueOnce({ id: 1 }); // activeClash
      const service = new RoleService(prisma);

      await expect(
        service.create(5, { roleName: 'Manager', rules: [] } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('throws when the org is already at its role capacity', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.role.count.mockResolvedValue(3);
      prisma.organizationCapacity.findUnique.mockResolvedValue({ roles: 3 });
      const service = new RoleService(prisma);

      await expect(
        service.create(5, { roleName: 'Manager', rules: [] } as never),
      ).rejects.toThrow('Role limit reached (3).');
    });

    it('revives a soft-deleted role, connecting the new rule set', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce({ id: 9, roleName: 'Manager' })
        .mockResolvedValueOnce(null);
      prisma.role.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.role.update.mockResolvedValue({ id: 9 });
      const service = new RoleService(prisma);

      await service.create(5, {
        roleName: 'Manager',
        roleDesc: 'desc',
        rules: [{ id: 1 }, { id: 2 }],
      } as never);

      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: {
          roleDesc: 'desc',
          isDeleted: false,
          isDefault: false,
          rules: { set: [{ id: 1 }, { id: 2 }] },
        },
        include: { rules: true },
      });
    });

    it('creates a brand new role when there is nothing to revive', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.role.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue({ id: 10 });
      const service = new RoleService(prisma);

      await service.create(5, {
        roleName: 'Manager',
        roleDesc: 'desc',
        rules: [{ id: 1 }],
      } as never);

      expect(prisma.role.create).toHaveBeenCalledWith({
        data: {
          orgId: 5,
          roleName: 'Manager',
          roleDesc: 'desc',
          rules: { connect: [{ id: 1 }] },
        },
        include: { rules: true },
      });
    });
  });

  describe('updateRules', () => {
    it('throws NotFoundException for a missing role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue(null);
      const service = new RoleService(prisma);

      await expect(
        service.updateRules(1, { rules: [] } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a locked role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue({ id: 1, isLocked: true });
      const service = new RoleService(prisma);

      await expect(
        service.updateRules(1, { rules: [] } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('replaces the rule set for an editable role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue({ id: 1, isLocked: false });
      prisma.role.update.mockResolvedValue({ id: 1 });
      const service = new RoleService(prisma);

      await service.updateRules(1, { rules: [{ id: 2 }] } as never);

      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rules: { set: [{ id: 2 }] } },
        include: { rules: true },
      });
    });
  });

  describe('updateInfo', () => {
    it('throws ForbiddenException for a locked role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue({ id: 1, isLocked: true });
      const service = new RoleService(prisma);

      await expect(
        service.updateInfo(1, { roleName: 'New' } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when renaming to a name another active role already has', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce({
          id: 1,
          orgId: 5,
          roleName: 'Old',
          isLocked: false,
        })
        .mockResolvedValueOnce({ id: 2 });
      const service = new RoleService(prisma);

      await expect(
        service.updateInfo(1, { roleName: 'New' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('renames when the new name clashes with no other role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce({
          id: 1,
          orgId: 5,
          roleName: 'Old',
          isLocked: false,
        })
        .mockResolvedValueOnce(null);
      prisma.role.update.mockResolvedValue({ id: 1 });
      const service = new RoleService(prisma);

      await service.updateInfo(1, { roleName: 'New' } as never);

      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { roleName: 'New' },
      });
    });

    it('updates without a clash check when roleName is unchanged', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 1,
        orgId: 5,
        roleName: 'Manager',
        isLocked: false,
      });
      prisma.role.update.mockResolvedValue({ id: 1 });
      const service = new RoleService(prisma);

      await service.updateInfo(1, { roleDesc: 'new desc' } as never);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { roleDesc: 'new desc' },
      });
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException for a locked role', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue({ id: 1, isLocked: true });
      const service = new RoleService(prisma);

      await expect(service.remove(1)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException for a global role template', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst.mockResolvedValue({
        id: 1,
        isLocked: false,
        orgId: null,
      });
      const service = new RoleService(prisma);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no fallback Member role exists', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce({ id: 1, isLocked: false, orgId: 5 })
        .mockResolvedValueOnce(null); // fallback lookup
      const service = new RoleService(prisma);

      await expect(service.remove(1)).rejects.toThrow(
        'No default Member role found',
      );
    });

    it('reassigns members to the fallback role and soft-deletes the role in one transaction', async () => {
      const prisma = createMockPrisma();
      prisma.role.findFirst
        .mockResolvedValueOnce({ id: 1, isLocked: false, orgId: 5 })
        .mockResolvedValueOnce({ id: 2, roleName: 'Member' });
      const service = new RoleService(prisma);

      await service.remove(1);

      expect(prisma.member.updateMany).toHaveBeenCalledWith({
        where: { roleId: 1 },
        data: { roleId: 2 },
      });
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
