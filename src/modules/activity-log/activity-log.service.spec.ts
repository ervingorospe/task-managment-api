import { ActivityLogService } from './activity-log.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { NotificationEventsService } from './notification-events.service';
import type { RealtimeEventsService } from './realtime-events.service';

function makeNotificationEvents() {
  return {
    notify: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  } as unknown as NotificationEventsService;
}

function makeRealtimeEvents() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  } as unknown as RealtimeEventsService;
}

describe('ActivityLogService', () => {
  describe('log', () => {
    it('notifies every involved user except the actor for a TICKET entry', async () => {
      const prisma = createMockPrisma();
      prisma.activityLogEntry.create.mockResolvedValue({
        module: 'TICKET',
        actorId: 1,
        orgId: 5,
        involvedUserIds: [1, 2, 3],
      });
      const notificationEvents = makeNotificationEvents();
      const service = new ActivityLogService(
        prisma,
        notificationEvents,
        makeRealtimeEvents(),
      );

      await service.log({} as never);

      expect(notificationEvents.notify).toHaveBeenCalledTimes(2);
      expect(notificationEvents.notify).toHaveBeenCalledWith(2);
      expect(notificationEvents.notify).toHaveBeenCalledWith(3);
      expect(notificationEvents.notify).not.toHaveBeenCalledWith(1);
    });

    it('does not notify anyone for a non-TICKET module entry', async () => {
      const prisma = createMockPrisma();
      prisma.activityLogEntry.create.mockResolvedValue({
        module: 'MEMBER',
        actorId: 1,
        orgId: 5,
        involvedUserIds: [2],
      });
      const notificationEvents = makeNotificationEvents();
      const service = new ActivityLogService(
        prisma,
        notificationEvents,
        makeRealtimeEvents(),
      );

      await service.log({} as never);

      expect(notificationEvents.notify).not.toHaveBeenCalled();
    });

    it.each(['TICKET', 'REQUEST', 'PROJECT'] as const)(
      "publishes to the org's channel for an org-scoped %s entry",
      async (module) => {
        const prisma = createMockPrisma();
        prisma.activityLogEntry.create.mockResolvedValue({
          module,
          actorId: 1,
          orgId: 5,
          involvedUserIds: [1],
        });
        const realtimeEvents = makeRealtimeEvents();
        const service = new ActivityLogService(
          prisma,
          makeNotificationEvents(),
          realtimeEvents,
        );

        await service.log({} as never);

        expect(realtimeEvents.publish).toHaveBeenCalledWith('org:5', module);
      },
    );

    it("publishes to the owner's channel for a personal (org-less) TICKET entry", async () => {
      const prisma = createMockPrisma();
      prisma.activityLogEntry.create.mockResolvedValue({
        module: 'TICKET',
        actorId: 7,
        orgId: null,
        involvedUserIds: [7],
      });
      const realtimeEvents = makeRealtimeEvents();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        realtimeEvents,
      );

      await service.log({} as never);

      expect(realtimeEvents.publish).toHaveBeenCalledWith('user:7', 'TICKET');
    });

    it('does not publish a realtime event for a module with no live list (e.g. MEMBER)', async () => {
      const prisma = createMockPrisma();
      prisma.activityLogEntry.create.mockResolvedValue({
        module: 'MEMBER',
        actorId: 1,
        orgId: 5,
        involvedUserIds: [1],
      });
      const realtimeEvents = makeRealtimeEvents();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        realtimeEvents,
      );

      await service.log({} as never);

      expect(realtimeEvents.publish).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes by orgId and paginates with defaults', async () => {
      const prisma = createMockPrisma();
      prisma.activityLogEntry.findMany.mockResolvedValue([]);
      prisma.activityLogEntry.count.mockResolvedValue(0);
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      const result = await service.list({ orgId: 5 } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith({
        where: { orgId: 5 },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 15,
      });
      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 15 });
    });

    it('filters by validated, uppercased module values', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, module: ['ticket', 'bogus'] } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, module: { in: ['TICKET'] } },
        }),
      );
    });

    it('omits the module filter entirely when nothing validates', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, module: ['bogus'] } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: 5 } }),
      );
    });

    it('filters by author ids', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, author: [1, 2] } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, actorId: { in: [1, 2] } },
        }),
      );
    });

    it('filters by a date range', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({
        orgId: 5,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 5,
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          },
        }),
      );
    });

    it('filters by dateFrom alone', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, dateFrom: '2026-01-01' } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, createdAt: { gte: new Date('2026-01-01') } },
        }),
      );
    });

    it('filters by dateTo alone', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, dateTo: '2026-01-31' } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, createdAt: { lte: new Date('2026-01-31') } },
        }),
      );
    });

    it('respects a custom page and limit', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.list({ orgId: 5, page: 3, limit: 10 } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('listPersonal', () => {
    it('scopes by orgId: null and actorId instead of orgId', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.listPersonal(7, {} as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: null, actorId: 7 } }),
      );
    });

    it('also applies the module filter', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.listPersonal(7, { module: ['member'] } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: null, actorId: 7, module: { in: ['MEMBER'] } },
        }),
      );
    });

    it('also applies the date range filter', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.listPersonal(7, { dateFrom: '2026-01-01' } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: null,
            actorId: 7,
            createdAt: { gte: new Date('2026-01-01') },
          },
        }),
      );
    });

    it('applies dateTo alone', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.listPersonal(7, { dateTo: '2026-01-31' } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: null,
            actorId: 7,
            createdAt: { lte: new Date('2026-01-31') },
          },
        }),
      );
    });

    it('omits the module filter entirely when nothing validates', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.listPersonal(7, { module: ['bogus'] } as never);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: null, actorId: 7 } }),
      );
    });
  });

  describe('getNotifications', () => {
    it("scopes to the user's orgs, excludes their own actions, and computes unreadCount against notificationsSeenAt", async () => {
      const prisma = createMockPrisma();
      prisma.member.findMany.mockResolvedValue([{ orgId: 1 }, { orgId: 2 }]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        notificationsSeenAt: new Date('2026-01-01'),
      });
      prisma.activityLogEntry.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.activityLogEntry.count.mockResolvedValue(3);
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      const result = await service.getNotifications(7);

      expect(prisma.activityLogEntry.findMany).toHaveBeenCalledWith({
        where: {
          module: 'TICKET',
          orgId: { in: [1, 2] },
          involvedUserIds: { has: 7 },
          actorId: { not: 7 },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(prisma.activityLogEntry.count).toHaveBeenCalledWith({
        where: {
          module: 'TICKET',
          orgId: { in: [1, 2] },
          involvedUserIds: { has: 7 },
          actorId: { not: 7 },
          createdAt: { gt: new Date('2026-01-01') },
        },
      });
      expect(result).toEqual({ items: [{ id: 1 }], unreadCount: 3 });
    });
  });

  describe('markNotificationsSeen', () => {
    it('stamps notificationsSeenAt with the current time', async () => {
      const prisma = createMockPrisma();
      const service = new ActivityLogService(
        prisma,
        makeNotificationEvents(),
        makeRealtimeEvents(),
      );

      await service.markNotificationsSeen(7);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { notificationsSeenAt: expect.any(Date) },
      });
    });
  });
});
