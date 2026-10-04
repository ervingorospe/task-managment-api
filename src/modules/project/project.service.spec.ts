import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectService } from './project.service';
import { createMockPrisma } from '../../test/mock-prisma';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';
import type { PermissionsService } from '../../common/permissions/permissions.service';

function makePermissions(membership: unknown) {
  return {
    getMembership: jest.fn().mockResolvedValue(membership),
  } as unknown as PermissionsService;
}

describe('ProjectService', () => {
  describe('projects', () => {
    it('lists every project for a caller with project.view', async () => {
      const prisma = createMockPrisma();
      const permissions = makePermissions({
        memberId: 1,
        rules: new Set([PERMISSIONS.PROJECT_VIEW]),
      });
      const service = new ProjectService(prisma, permissions);

      await service.projects(5, 1);

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: 5, isDeleted: false } }),
      );
    });

    it('restricts to assigned projects for a caller without project.view', async () => {
      const prisma = createMockPrisma();
      const permissions = makePermissions({ memberId: 9, rules: new Set() });
      const service = new ProjectService(prisma, permissions);

      await service.projects(5, 1);

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 5,
            isDeleted: false,
            assignees: { some: { id: 9 } },
          },
        }),
      );
    });

    it('restricts to a never-matching member id when the caller has no membership', async () => {
      const prisma = createMockPrisma();
      const permissions = makePermissions(null);
      const service = new ProjectService(prisma, permissions);

      await service.projects(5, 1);

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 5,
            isDeleted: false,
            assignees: { some: { id: -1 } },
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('returns the project when the caller can see everything', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        assignees: [],
      });
      const permissions = makePermissions({
        memberId: 1,
        rules: new Set([PERMISSIONS.PROJECT_VIEW]),
      });
      const service = new ProjectService(prisma, permissions);

      await expect(service.findOne(1, 1)).resolves.toEqual(
        expect.objectContaining({ id: 1 }),
      );
    });

    it('returns the project when the restricted caller is actually assigned', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        assignees: [{ id: 9 }],
      });
      const permissions = makePermissions({ memberId: 9, rules: new Set() });
      const service = new ProjectService(prisma, permissions);

      await expect(service.findOne(1, 1)).resolves.toEqual(
        expect.objectContaining({ id: 1 }),
      );
    });

    it('throws NotFoundException (not Forbidden) when a restricted caller is not assigned', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        assignees: [{ id: 99 }],
      });
      const permissions = makePermissions({ memberId: 9, rules: new Set() });
      const service = new ProjectService(prisma, permissions);

      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('throws when an active project with the same name exists', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValueOnce({ id: 1 });
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(
        service.create(5, { name: 'Website' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('throws when the org is at its project capacity', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValueOnce(null);
      prisma.project.count.mockResolvedValue(2);
      prisma.organizationCapacity.findUnique.mockResolvedValue({
        projects: 2,
      });
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(
        service.create(5, { name: 'Website' } as never),
      ).rejects.toThrow('Project limit reached (2).');
    });

    it('revives a soft-deleted project, setting the new assignee list', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce(null) // active clash
        .mockResolvedValueOnce({ id: 9 }); // existing deleted
      prisma.project.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await service.create(5, {
        name: 'Website',
        description: 'desc',
        clientId: 2,
        assigneeIds: [1, 2],
      } as never);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: {
          description: 'desc',
          clientId: 2,
          isDeleted: false,
          assignees: { set: [{ id: 1 }, { id: 2 }] },
        },
        include: expect.anything(),
      });
    });

    it('revives a soft-deleted project with an empty assignee list when assigneeIds is omitted', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce(null) // active clash
        .mockResolvedValueOnce({ id: 9 }); // existing deleted
      prisma.project.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await service.create(5, { name: 'Website' } as never);

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignees: { set: [] } }),
        }),
      );
    });

    it('creates a brand new project with connected assignees', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.project.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await service.create(5, {
        name: 'Website',
        assigneeIds: [1],
      } as never);

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 5,
          name: 'Website',
          assignees: { connect: [{ id: 1 }] },
        }),
        include: expect.anything(),
      });
    });

    it('creates with assignees undefined when assigneeIds is omitted', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.project.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await service.create(5, { name: 'Website' } as never);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignees: undefined }),
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a missing project', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(service.update(1, { name: 'New' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when renaming to a name another active project already has', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce({ id: 1, orgId: 5, name: 'Old' })
        .mockResolvedValueOnce({ id: 2 });
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(service.update(1, { name: 'New' } as never)).rejects.toThrow(
        ConflictException,
      );
    });

    it('renames when the new name clashes with no other project', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst
        .mockResolvedValueOnce({ id: 1, orgId: 5, name: 'Old' })
        .mockResolvedValueOnce(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await service.update(1, { name: 'New' } as never);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New', assignees: undefined },
        include: expect.anything(),
      });
    });

    it('sets a new assignee list when assigneeIds is provided', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValueOnce({
        id: 1,
        orgId: 5,
        name: 'Website',
      });
      const service = new ProjectService(prisma, makePermissions(null));

      await service.update(1, { assigneeIds: [3] } as never);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { assignees: { set: [{ id: 3 }] } },
        include: expect.anything(),
      });
    });

    it('leaves assignees untouched when assigneeIds is not provided', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValueOnce({
        id: 1,
        orgId: 5,
        name: 'Website',
      });
      const service = new ProjectService(prisma, makePermissions(null));

      await service.update(1, { description: 'new desc' } as never);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { description: 'new desc', assignees: undefined },
        include: expect.anything(),
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a missing project', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue(null);
      const service = new ProjectService(prisma, makePermissions(null));

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes an existing project', async () => {
      const prisma = createMockPrisma();
      prisma.project.findFirst.mockResolvedValue({ id: 1 });
      const service = new ProjectService(prisma, makePermissions(null));

      await service.remove(1);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
    });
  });
});
