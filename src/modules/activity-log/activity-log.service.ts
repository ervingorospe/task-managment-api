import { Injectable } from '@nestjs/common';
import { ActivityModule, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';
import { RealtimeEventsService } from './realtime-events.service';
import type { LogActivityDto } from './dto/log-activity.dto';
import type { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import type { PersonalActivityLogQueryDto } from './dto/personal-activity-log-query.dto';

const VALID_ACTIVITY_MODULES = new Set<string>(Object.values(ActivityModule));

function isActivityModule(value: string): value is ActivityModule {
  return VALID_ACTIVITY_MODULES.has(value);
}

// Modules whose own list pages (not just the notification bell) get a
// live "something changed" push — see RealtimeEventsService. Deliberately
// narrower than every ActivityModule: Member/Role/Tag changes are rare
// enough, and their pages small enough, that a live push isn't worth a
// stream for them yet.
const LIVE_LIST_MODULES = new Set<ActivityModule>([
  'TICKET',
  'REQUEST',
  'PROJECT',
]);

@Injectable()
export class ActivityLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEvents: NotificationEventsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * Standalone table — no foreign keys, no joins. Everything here is a
   * plain copy captured at write time (see schema.prisma's header note and
   * the frontend's lib/helper/activity-access.ts for the same rule).
   */
  async log(dto: LogActivityDto) {
    const entry = await this.prisma.activityLogEntry.create({ data: dto });

    // Same audience and exclusion rule as getNotifications() below — every
    // involved user except whoever just did this, so the bell's SSE stream
    // and its REST query never disagree about who gets notified.
    if (entry.module === 'TICKET') {
      for (const userId of entry.involvedUserIds) {
        if (userId !== entry.actorId) this.notificationEvents.notify(userId);
      }
    }

    // Live list push — org-scoped lists share one channel per org (every
    // active member gets the signal; their own permission-filtered GET
    // decides what they actually see, same "never carry the payload"
    // rule as the notification bell). A personal ticket has no org, so
    // it goes to the owner's own channel instead — unlike the bell
    // above, this does NOT exclude the actor, since their other open
    // tabs still need to refetch after their own action.
    if (LIVE_LIST_MODULES.has(entry.module)) {
      const channel =
        entry.orgId != null
          ? RealtimeEventsService.orgChannel(entry.orgId)
          : RealtimeEventsService.userChannel(entry.actorId);
      this.realtimeEvents.publish(channel, entry.module);
    }

    return entry;
  }

  async list(query: ActivityLogQueryDto) {
    const where: Prisma.ActivityLogEntryWhereInput = { orgId: query.orgId };

    if (query.module?.length) {
      const modules = query.module
        .map((m) => m.toUpperCase())
        .filter(isActivityModule);
      if (modules.length) where.module = { in: modules };
    }
    if (query.author?.length) {
      where.actorId = { in: query.author };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    return this.listForWhere(where, query);
  }

  /** Personal (org-less) activity has no org to scope by — actorId does
   * the job instead, since the owner is always the actor for their own
   * personal-ticket activity. */
  async listPersonal(userId: number, query: PersonalActivityLogQueryDto) {
    const where: Prisma.ActivityLogEntryWhereInput = {
      orgId: null,
      actorId: userId,
    };

    if (query.module?.length) {
      const modules = query.module
        .map((m) => m.toUpperCase())
        .filter(isActivityModule);
      if (modules.length) where.module = { in: modules };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    return this.listForWhere(where, query);
  }

  private async listForWhere(
    where: Prisma.ActivityLogEntryWhereInput,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;

    const [items, total] = await Promise.all([
      this.prisma.activityLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLogEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** The bell icon's feed — ticket activity that involves this user, across
   * every org they currently belong to, excluding their own actions (you
   * don't need to be told about something you just did yourself).
   * `unreadCount` is everything newer than their notificationsSeenAt
   * cursor (see schema.prisma's doc comment on that field); `items` is
   * just the most recent slice, read or not, so the dropdown still shows
   * something right after it's been marked seen. */
  async getNotifications(userId: number) {
    const [orgIds, user] = await Promise.all([
      this.prisma.member
        .findMany({
          where: { userId, isActive: true, isDeleted: false },
          select: { orgId: true },
        })
        .then((rows) => rows.map((r) => r.orgId)),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { notificationsSeenAt: true },
      }),
    ]);

    const where = {
      module: 'TICKET' as const,
      orgId: { in: orgIds },
      involvedUserIds: { has: userId },
      actorId: { not: userId },
    };

    const [items, unreadCount] = await Promise.all([
      this.prisma.activityLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.activityLogEntry.count({
        where: { ...where, createdAt: { gt: user.notificationsSeenAt } },
      }),
    ]);

    return { items, unreadCount };
  }

  async markNotificationsSeen(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationsSeenAt: new Date() },
    });
  }
}
