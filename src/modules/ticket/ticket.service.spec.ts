import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { S3Service } from '../storage/s3.service';

function makeS3() {
  return { upload: jest.fn(), delete: jest.fn() } as unknown as S3Service;
}

describe('TicketService', () => {
  describe('countNumbers / countNumbersPersonal', () => {
    it('computes totals, overdues, onTime, and per-tag counts for an org', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3); // overdue
      prisma.tag.findMany.mockResolvedValue([
        { id: 1, tagName: 'Bug', color: '#f00' },
        { id: 2, tagName: 'Feature', color: '#0f0' },
      ]);
      prisma.ticket.groupBy.mockResolvedValue([
        { tagId: 1, _count: { _all: 7 } },
      ]);
      const service = new TicketService(prisma, makeS3());

      const result = await service.countNumbers({ orgId: 5 } as never);

      expect(result).toEqual({
        totalTickets: 10,
        overdues: 3,
        onTime: 7,
        countPerTag: [
          { tagId: 1, tagName: 'Bug', color: '#f00', count: 7 },
          { tagId: 2, tagName: 'Feature', color: '#0f0', count: 0 },
        ],
      });
    });

    it('filters tags by projectIds when given', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.ticket.groupBy.mockResolvedValue([]);
      const service = new TicketService(prisma, makeS3());

      await service.countNumbers({ orgId: 5, projectIds: [1, 2] } as never);

      expect(prisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: { in: [1, 2] } }),
        }),
      );
    });

    it('applies a date range to the count query', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.ticket.groupBy.mockResolvedValue([]);
      const service = new TicketService(prisma, makeS3());

      await service.countNumbers({
        orgId: 5,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as never);

      expect(prisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          }),
        }),
      );
    });

    it('applies dateFrom alone to the count query', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.ticket.groupBy.mockResolvedValue([]);
      const service = new TicketService(prisma, makeS3());

      await service.countNumbers({
        orgId: 5,
        dateFrom: '2026-01-01',
      } as never);

      expect(prisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: new Date('2026-01-01') },
          }),
        }),
      );
    });

    it('applies dateTo alone to the count query', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.ticket.groupBy.mockResolvedValue([]);
      const service = new TicketService(prisma, makeS3());

      await service.countNumbers({
        orgId: 5,
        dateTo: '2026-01-31',
      } as never);

      expect(prisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: new Date('2026-01-31') },
          }),
        }),
      );
    });

    it('scopes personal counts by ownerId and orgId: null tags', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.ticket.groupBy.mockResolvedValue([]);
      const service = new TicketService(prisma, makeS3());

      await service.countNumbersPersonal(7, {} as never);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { orgId: null, isDeleted: false },
      });
      expect(prisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 7 }),
        }),
      );
    });
  });

  describe('ticketWhere filters (via allForOrg/list)', () => {
    it('filters by overdue', async () => {
      const prisma = createMockPrisma();
      const service = new TicketService(prisma, makeS3());
      await service.allForOrg(5, undefined);
      // overdue isn't passed here; verify filterBy path separately below
      expect(prisma.ticket.findMany).toHaveBeenCalled();
    });

    it('applies overdue/starred/tagId filters together via list()', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({
        orgId: 5,
        filterBy: ['overdue', 'starred', '3'],
      } as never);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: { lt: expect.any(Date) },
            starred: true,
            tagId: { in: [3] },
          }),
        }),
      );
    });

    it('scopes by involvesUserId via an OR of client/assignee', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({ orgId: 5, involvesUserId: 9 } as never);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { client: { userId: 9 } },
              { assignees: { some: { userId: 9 } } },
            ],
          }),
        }),
      );
    });

    it('filters by memberIds (assignees) and projectIds in list()', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({
        orgId: 5,
        memberIds: [1, 2],
        projectIds: [3],
      } as never);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignees: { some: { id: { in: [1, 2] } } },
            projectId: { in: [3] },
          }),
        }),
      );
    });

    it('searches title/referenceId, nested under AND so it coexists with an existing OR', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({
        orgId: 5,
        involvesUserId: 9,
        search: '  bug  ',
      } as never);

      const [args] = prisma.ticket.findMany.mock.calls[0];
      expect(args.where.OR).toEqual([
        { client: { userId: 9 } },
        { assignees: { some: { userId: 9 } } },
      ]);
      expect(args.where.AND).toEqual([
        {
          OR: [
            { title: { contains: 'bug', mode: 'insensitive' } },
            { referenceId: { contains: 'bug', mode: 'insensitive' } },
          ],
        },
      ]);
    });

    it('merges a due-date range filter with an existing overdue "lt" filter', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({
        orgId: 5,
        filterBy: ['overdue'],
        dueDateFrom: '2026-01-01',
      } as never);

      const [args] = prisma.ticket.findMany.mock.calls[0];
      expect(args.where.dueDate).toEqual({
        lt: expect.any(Date),
        gte: new Date('2026-01-01'),
      });
    });

    it('scopes listPersonal by ownerId, without a memberIds filter', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.listPersonal(7, { filterBy: ['starred'] } as never);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 7, isDeleted: false, starred: true },
        }),
      );
    });

    it('respects a custom page/limit in listForWhere', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({ orgId: 5, page: 2, limit: 5 } as never);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('applies a due-date range filter with no pre-existing dueDate filter', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3());

      await service.list({
        orgId: 5,
        dueDateTo: '2026-01-31',
      } as never);

      const [args] = prisma.ticket.findMany.mock.calls[0];
      expect(args.where.dueDate).toEqual({ lte: new Date('2026-01-31') });
    });

    it('merges where.AND when it already holds a plain object or an array (defensive, via listForWhere directly)', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);
      const service = new TicketService(prisma, makeS3()) as unknown as {
        listForWhere: (
          where: Record<string, unknown>,
          query: { search?: string },
        ) => Promise<unknown>;
      };
      const expectedAnd = [
        { foo: 'bar' },
        expect.objectContaining({ OR: expect.any(Array) }),
      ];

      await service.listForWhere({ AND: { foo: 'bar' } }, { search: 'bug' });
      const [firstCall] = prisma.ticket.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];
      expect(firstCall.where.AND).toEqual(expectedAnd);

      await service.listForWhere({ AND: [{ foo: 'bar' }] }, { search: 'bug' });
      const [secondCall] = prisma.ticket.findMany.mock.calls[1] as [
        { where: { AND: unknown[] } },
      ];
      expect(secondCall.where.AND).toEqual(expectedAnd);
    });
  });

  describe('allForOwner / recent', () => {
    it('scopes allForOwner by ownerId', async () => {
      const prisma = createMockPrisma();
      const service = new TicketService(prisma, makeS3());
      await service.allForOwner(7);
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 7, isDeleted: false } }),
      );
    });

    it('fetches the 5 most recent tickets and requests for an org', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.ticketRequest.findMany.mockResolvedValue([{ id: 2 }]);
      const service = new TicketService(prisma, makeS3());

      const result = await service.recent(5);

      expect(result).toEqual({
        tickets: [{ id: 1 }],
        requests: [{ id: 2 }],
      });
    });
  });

  describe('details', () => {
    it('throws NotFoundException for a missing ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(service.details(1)).rejects.toThrow(NotFoundException);
    });

    it('returns the ticket when found', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1, title: 'Bug' });
      const service = new TicketService(prisma, makeS3());

      const result = await service.details(1);

      expect(result).toEqual({ id: 1, title: 'Bug' });
    });
  });

  describe('create', () => {
    it('creates with a generated referenceId, connected assignees, and inline attachments', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count
        .mockResolvedValueOnce(4) // existingCount
        .mockResolvedValueOnce(2); // activeCount
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.ticket.create.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.create(5, {
        title: 'Bug',
        tagId: 1,
        dueDate: '2026-02-01',
        assigneeIds: [1, 2],
        attachments: [{ name: 'a.png', url: 'x', size: 1 }],
      } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 5,
            referenceId: 'tckt-00005',
            dueDate: new Date('2026-02-01'),
            assignees: { connect: [{ id: 1 }, { id: 2 }] },
            attachments: { create: [{ name: 'a.png', url: 'x', size: 1 }] },
          }),
        }),
      );
    });

    it('creates with no dueDate, assignees, or attachments when omitted', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.ticket.create.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.create(5, { title: 'Bug', tagId: 1 } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: null,
            assignees: undefined,
            attachments: undefined,
          }),
        }),
      );
    });

    it('throws when the org is at ticket capacity', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
      prisma.organizationCapacity.findUnique.mockResolvedValue({
        tickets: 5,
      });
      const service = new TicketService(prisma, makeS3());

      await expect(
        service.create(5, { title: 'Bug' } as never),
      ).rejects.toThrow('Ticket limit reached (5).');
    });
  });

  describe('createPersonal', () => {
    it('creates a personal ticket scoped by ownerId, without project/assignees', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.create.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.createPersonal(7, { title: 'Personal task' } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 7,
          referenceId: 'tckt-00001',
          title: 'Personal task',
          attachments: undefined,
        }),
        include: { tag: true, attachments: true },
      });
    });

    it('creates a personal ticket with a dueDate and inline attachments', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.create.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.createPersonal(7, {
        title: 'Personal task',
        dueDate: '2026-02-01',
        attachments: [{ name: 'a.png', url: 'x', size: 1 }],
      } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dueDate: new Date('2026-02-01'),
          attachments: { create: [{ name: 'a.png', url: 'x', size: 1 }] },
        }),
        include: { tag: true, attachments: true },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a missing ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(service.update(1, {} as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('clears dueDate when explicitly set to a falsy value', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.update(1, { dueDate: '' } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dueDate: null }),
        }),
      );
    });

    it('leaves dueDate untouched when omitted entirely', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.update(1, { title: 'New' } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dueDate: undefined }),
        }),
      );
    });

    it('sets a new dueDate when given', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.update(1, { dueDate: '2026-03-01' } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dueDate: new Date('2026-03-01') }),
        }),
      );
    });

    it('sets a new projectId when given', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.update(1, { projectId: 7 } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectId: 7 }),
        }),
      );
    });
  });

  describe('updateTag / updateAssignees / updateStar / remove', () => {
    it('updates the tag', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.updateTag(1, { tagId: 3 } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tagId: 3 } }),
      );
    });

    it('replaces the assignee set', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.updateAssignees(1, { assigneeIds: [1, 2] } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignees: { set: [{ id: 1 }, { id: 2 }] } },
        }),
      );
    });

    it('updates the starred flag', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.updateStar(1, { starred: true } as never);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { starred: true } }),
      );
    });

    it('soft-deletes the ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.remove(1);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
    });
  });

  describe('comments', () => {
    it('throws NotFoundException adding a comment to a missing ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(
        service.addComment(1, 1, { comment: 'hi' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('adds a comment for an existing ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, makeS3());

      await service.addComment(1, 7, { comment: 'hi' } as never);

      expect(prisma.ticketComment.create).toHaveBeenCalledWith({
        data: { ticketId: 1, userId: 7, comment: 'hi' },
        include: { author: true },
      });
    });

    it("throws ForbiddenException editing someone else's comment", async () => {
      const prisma = createMockPrisma();
      prisma.ticketComment.findFirst.mockResolvedValue({
        id: 1,
        userId: 99,
      });
      const service = new TicketService(prisma, makeS3());

      await expect(
        service.updateComment(1, 1, { comment: 'edit' } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows editing one's own comment", async () => {
      const prisma = createMockPrisma();
      prisma.ticketComment.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      const service = new TicketService(prisma, makeS3());

      await service.updateComment(1, 7, { comment: 'edit' } as never);

      expect(prisma.ticketComment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { comment: 'edit' } }),
      );
    });

    it('throws NotFoundException for a missing comment', async () => {
      const prisma = createMockPrisma();
      prisma.ticketComment.findFirst.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(service.updateComment(1, 7, {} as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException removing someone else's comment", async () => {
      const prisma = createMockPrisma();
      prisma.ticketComment.findFirst.mockResolvedValue({
        id: 1,
        userId: 99,
      });
      const service = new TicketService(prisma, makeS3());

      await expect(service.removeComment(1, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("soft-deletes one's own comment", async () => {
      const prisma = createMockPrisma();
      prisma.ticketComment.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      const service = new TicketService(prisma, makeS3());

      await service.removeComment(1, 7);

      expect(prisma.ticketComment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
    });
  });

  describe('attachments', () => {
    it('throws NotFoundException adding an attachment to a missing ticket', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(
        service.addAttachment(1, {} as Express.Multer.File),
      ).rejects.toThrow(NotFoundException);
    });

    it('uploads to S3 and records the attachment', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findFirst.mockResolvedValue({ id: 1 });
      const s3 = makeS3();
      (s3.upload as jest.Mock).mockResolvedValue({
        key: 'k',
        url: 'https://x/k',
      });
      prisma.ticketAttachment.create.mockResolvedValue({ id: 1 });
      const service = new TicketService(prisma, s3);

      const file = {
        originalname: 'a.png',
        size: 123,
      } as Express.Multer.File;
      await service.addAttachment(1, file);

      expect(prisma.ticketAttachment.create).toHaveBeenCalledWith({
        data: { ticketId: 1, name: 'a.png', url: 'https://x/k', size: 123 },
      });
    });

    it('throws NotFoundException removing a missing attachment', async () => {
      const prisma = createMockPrisma();
      prisma.ticketAttachment.findUnique.mockResolvedValue(null);
      const service = new TicketService(prisma, makeS3());

      await expect(service.removeAttachment(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes the DB row and best-effort deletes from S3', async () => {
      const prisma = createMockPrisma();
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 1,
        url: 'https://x/k',
      });
      const s3 = makeS3();
      const service = new TicketService(prisma, s3);

      await service.removeAttachment(1);

      expect(prisma.ticketAttachment.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(s3.delete).toHaveBeenCalledWith('https://x/k');
    });
  });
});
