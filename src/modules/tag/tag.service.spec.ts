import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('TagService', () => {
  describe('tags', () => {
    it('lists non-deleted tags for the org, ordered by name', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findMany.mockResolvedValue([{ id: 1 }]);
      const service = new TagService(prisma);

      await service.tags(5);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { orgId: 5, isDeleted: false },
        orderBy: { tagName: 'asc' },
      });
    });
  });

  describe('add', () => {
    it('throws when an active tag with the same name already exists', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValueOnce({ id: 1 });
      const service = new TagService(prisma);

      await expect(
        service.add(5, { tagName: 'Bug', color: '#fff' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('throws when the org is already at its tag capacity', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValueOnce(null); // no active clash
      prisma.tag.count.mockResolvedValue(5);
      prisma.organizationCapacity.findUnique.mockResolvedValue({ tags: 5 });
      const service = new TagService(prisma);

      await expect(
        service.add(5, { tagName: 'Bug', color: '#fff' } as never),
      ).rejects.toThrow('Tag limit reached (5).');
    });

    it('revives a soft-deleted tag with the same name instead of creating a new one', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst
        .mockResolvedValueOnce(null) // no active clash
        .mockResolvedValueOnce({ id: 9, tagName: 'Bug' }); // existing deleted
      prisma.tag.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.tag.update.mockResolvedValue({ id: 9 });
      const service = new TagService(prisma);

      await service.add(5, { tagName: 'Bug', color: '#f00' } as never);

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { color: '#f00', isDeleted: false, isDefault: false },
      });
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });

    it('creates a brand new tag when there is no clash and nothing to revive', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.tag.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue({ id: 10 });
      const service = new TagService(prisma);

      await service.add(5, { tagName: 'Bug', color: '#f00' } as never);

      expect(prisma.tag.create).toHaveBeenCalledWith({
        data: { orgId: 5, tagName: 'Bug', color: '#f00' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValue(null);
      const service = new TagService(prisma);

      await expect(
        service.update(1, { tagName: 'New' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when renaming to a name another active tag already has', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst
        .mockResolvedValueOnce({ id: 1, orgId: 5, tagName: 'Old' })
        .mockResolvedValueOnce({ id: 2 }); // clash
      const service = new TagService(prisma);

      await expect(
        service.update(1, { tagName: 'New' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('updates without a rename-clash check when tagName is unchanged', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValueOnce({
        id: 1,
        orgId: 5,
        tagName: 'Bug',
      });
      prisma.tag.update.mockResolvedValue({ id: 1 });
      const service = new TagService(prisma);

      await service.update(1, { color: '#000' } as never);

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { color: '#000' },
      });
    });

    it('allows renaming when the new name clashes with nothing active', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst
        .mockResolvedValueOnce({ id: 1, orgId: 5, tagName: 'Old' })
        .mockResolvedValueOnce(null);
      prisma.tag.update.mockResolvedValue({ id: 1 });
      const service = new TagService(prisma);

      await service.update(1, { tagName: 'New' } as never);
      expect(prisma.tag.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValue(null);
      const service = new TagService(prisma);

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a global tag template (orgId null)', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValue({ id: 1, orgId: null });
      const service = new TagService(prisma);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });

    it('throws when removing would leave the org with zero tags', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValue({ id: 1, orgId: 5 });
      prisma.tag.count.mockResolvedValue(1);
      const service = new TagService(prisma);

      await expect(service.remove(1)).rejects.toThrow(
        'An organization must keep at least one tag.',
      );
    });

    it('soft-deletes the tag when at least one other tag will remain', async () => {
      const prisma = createMockPrisma();
      prisma.tag.findFirst.mockResolvedValue({ id: 1, orgId: 5 });
      prisma.tag.count.mockResolvedValue(2);
      prisma.tag.update.mockResolvedValue({ id: 1 });
      const service = new TagService(prisma);

      await service.remove(1);

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
    });
  });
});
