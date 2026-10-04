import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TicketRequestService } from './ticket-request.service';
import { createMockPrisma } from '../../test/mock-prisma';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';
import type { PermissionsService } from '../../common/permissions/permissions.service';

function makePermissions(membership: unknown = null) {
  return {
    getMembership: jest.fn().mockResolvedValue(membership),
  } as unknown as PermissionsService;
}

describe('TicketRequestService', () => {
  describe('list', () => {
    it('scopes by org and paginates with defaults', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findMany.mockResolvedValue([]);
      prisma.ticketRequest.count.mockResolvedValue(0);
      const service = new TicketRequestService(prisma, makePermissions());

      await service.list({ orgId: 5 } as never);

      expect(prisma.ticketRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, isDeleted: false },
          skip: 0,
          take: 15,
        }),
      );
    });

    it('filters by validated status values', async () => {
      const prisma = createMockPrisma();
      const service = new TicketRequestService(prisma, makePermissions());

      await service.list({ orgId: 5, filterBy: ['pending', 'bogus'] } as never);

      expect(prisma.ticketRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, isDeleted: false, status: { in: ['PENDING'] } },
        }),
      );
    });

    it('omits the status filter entirely when nothing validates', async () => {
      const prisma = createMockPrisma();
      const service = new TicketRequestService(prisma, makePermissions());

      await service.list({ orgId: 5, filterBy: ['bogus'] } as never);

      expect(prisma.ticketRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, isDeleted: false },
        }),
      );
    });
  });

  describe('allForOrg', () => {
    it('scopes by org only when involvesUserId is not given', async () => {
      const prisma = createMockPrisma();
      const service = new TicketRequestService(prisma, makePermissions());

      await service.allForOrg(5);

      expect(prisma.ticketRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: 5, isDeleted: false } }),
      );
    });

    it('adds a client filter when involvesUserId is given', async () => {
      const prisma = createMockPrisma();
      const service = new TicketRequestService(prisma, makePermissions());

      await service.allForOrg(5, 7);

      expect(prisma.ticketRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, isDeleted: false, client: { userId: 7 } },
        }),
      );
    });
  });

  describe('details', () => {
    it('throws NotFoundException for a missing request', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue(null);
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(service.details(1)).rejects.toThrow(NotFoundException);
    });

    it('returns the request when found', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({ id: 1 });
      const service = new TicketRequestService(prisma, makePermissions());

      const result = await service.details(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('create', () => {
    it('throws NotFoundException when the client member does not exist in the org', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(
        service.create(5, 1, { clientId: 2 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when the member's role is not Client", async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({
        id: 2,
        userId: 1,
        role: { roleName: 'Manager' },
      });
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(
        service.create(5, 1, { clientId: 2 } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates the request directly when the client is submitting their own', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({
        id: 2,
        userId: 1,
        role: { roleName: 'Client' },
      });
      prisma.ticketRequest.count.mockResolvedValue(0);
      prisma.ticketRequest.create.mockResolvedValue({ id: 1 });
      const permissions = makePermissions();
      const service = new TicketRequestService(prisma, permissions);

      await service.create(5, 1, {
        clientId: 2,
        title: 'Need help',
      } as never);

      expect(permissions.getMembership).not.toHaveBeenCalled();
      expect(prisma.ticketRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 5,
            referenceId: 'req-00001',
            title: 'Need help',
            clientId: 2,
          }),
        }),
      );
    });

    it('throws when creating on behalf of a different client without request.all.create', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({
        id: 2,
        userId: 99, // not the caller
        role: { roleName: 'Client' },
      });
      const permissions = makePermissions({ rules: new Set() });
      const service = new TicketRequestService(prisma, permissions);

      await expect(
        service.create(5, 1, { clientId: 2 } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows creating on behalf of a different client with request.all.create', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({
        id: 2,
        userId: 99,
        role: { roleName: 'Client' },
      });
      prisma.ticketRequest.count.mockResolvedValue(3);
      prisma.ticketRequest.create.mockResolvedValue({ id: 1 });
      const permissions = makePermissions({
        rules: new Set([PERMISSIONS.REQUEST_ALL_CREATE]),
      });
      const service = new TicketRequestService(prisma, permissions);

      await service.create(5, 1, { clientId: 2 } as never);

      expect(prisma.ticketRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referenceId: 'req-00004' }),
        }),
      );
    });

    it('creates attachments inline when the dto includes them', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({
        id: 2,
        userId: 1,
        role: { roleName: 'Client' },
      });
      prisma.ticketRequest.count.mockResolvedValue(0);
      prisma.ticketRequest.create.mockResolvedValue({ id: 1 });
      const service = new TicketRequestService(prisma, makePermissions());

      await service.create(5, 1, {
        clientId: 2,
        attachments: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
      } as never);

      expect(prisma.ticketRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachments: {
              create: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
            },
          }),
        }),
      );
    });
  });

  describe('findPendingOrThrow (via update/reject/cancel)', () => {
    it('throws NotFoundException for a missing request', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue(null);
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(service.update(1, 1, {} as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the request is already resolved', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        status: 'APPROVED',
      });
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(service.update(1, 1, {} as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('updates title/description for the request owner', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        clientId: 2,
      });
      prisma.member.findUnique.mockResolvedValue({ userId: 1 });
      prisma.ticketRequest.update.mockResolvedValue({ id: 1 });
      const service = new TicketRequestService(prisma, makePermissions());

      await service.update(1, 1, {
        title: 'New title',
        description: 'New desc',
      } as never);

      expect(prisma.ticketRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { title: 'New title', description: 'New desc' },
        }),
      );
    });

    it("throws when updating someone else's request without request.all.update", async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        clientId: 2,
      });
      prisma.member.findUnique.mockResolvedValue({ userId: 99 });
      const permissions = makePermissions({ rules: new Set() });
      const service = new TicketRequestService(prisma, permissions);

      await expect(service.update(1, 1, {} as never)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reject', () => {
    it('sets status REJECTED with the given remarks', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      prisma.ticketRequest.update.mockResolvedValue({ id: 1 });
      const service = new TicketRequestService(prisma, makePermissions());

      await service.reject(1, { remarks: 'Not enough detail' } as never);

      expect(prisma.ticketRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'REJECTED', remarks: 'Not enough detail' },
        }),
      );
    });
  });

  describe('cancel', () => {
    it('sets status CANCELLED for the owner', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        clientId: 2,
      });
      prisma.member.findUnique.mockResolvedValue({ userId: 1 });
      prisma.ticketRequest.update.mockResolvedValue({ id: 1 });
      const service = new TicketRequestService(prisma, makePermissions());

      await service.cancel(1, 1);

      expect(prisma.ticketRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });
  });

  describe('approve', () => {
    it('creates a ticket from the request inside a transaction and marks it APPROVED', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        title: 'Need help',
        description: 'desc',
        clientId: 2,
      });
      prisma.ticketRequest.findUniqueOrThrow.mockResolvedValue({
        attachments: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
      });
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.create.mockResolvedValue({ id: 10 });
      prisma.ticketRequest.update.mockResolvedValue({ id: 1, ticketId: 10 });
      const service = new TicketRequestService(prisma, makePermissions());

      const result = await service.approve(1, {
        tagId: 3,
        assigneeIds: [4],
      } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 5,
            referenceId: 'tckt-00001',
            title: 'Need help',
            tagId: 3,
            clientId: 2,
            assignees: { connect: [{ id: 4 }] },
          }),
        }),
      );
      expect(prisma.ticketRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { status: 'APPROVED', ticketId: 10 },
        }),
      );
      expect(result).toEqual({
        request: { id: 1, ticketId: 10 },
        ticket: { id: 10 },
      });
    });

    it('sets a dueDate and leaves assignees unconnected when assigneeIds is omitted', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        title: 'Need help',
        description: 'desc',
        clientId: 2,
      });
      prisma.ticketRequest.findUniqueOrThrow.mockResolvedValue({
        attachments: [],
      });
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.create.mockResolvedValue({ id: 10 });
      prisma.ticketRequest.update.mockResolvedValue({ id: 1, ticketId: 10 });
      const service = new TicketRequestService(prisma, makePermissions());

      await service.approve(1, {
        tagId: 3,
        dueDate: '2026-02-01',
      } as never);

      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: new Date('2026-02-01'),
            assignees: undefined,
          }),
        }),
      );
    });

    it('logs without a stack trace when the transaction rejects with a non-Error value', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        title: 'Need help',
        clientId: 2,
      });
      prisma.ticketRequest.findUniqueOrThrow.mockResolvedValue({
        attachments: [],
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue('string rejection');
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(service.approve(1, {} as never)).rejects.toBe(
        'string rejection',
      );
    });

    it('logs and rethrows when the transaction fails', async () => {
      const prisma = createMockPrisma();
      prisma.ticketRequest.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        title: 'Need help',
        clientId: 2,
      });
      prisma.ticketRequest.findUniqueOrThrow.mockResolvedValue({
        attachments: [],
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('db exploded'),
      );
      const service = new TicketRequestService(prisma, makePermissions());

      await expect(service.approve(1, {} as never)).rejects.toThrow(
        'db exploded',
      );
    });
  });
});
