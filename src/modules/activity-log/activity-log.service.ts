import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { LogActivityDto } from './dto/log-activity.dto';
import type { ActivityLogQueryDto } from './dto/activity-log-query.dto';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Standalone table — no foreign keys, no joins. Everything here is a
   * plain copy captured at write time (see schema.prisma's header note and
   * the frontend's lib/helper/activity-access.ts for the same rule).
   */
  log(dto: LogActivityDto) {
    return this.prisma.activityLogEntry.create({ data: dto });
  }

  async list(query: ActivityLogQueryDto) {
    const where: any = { orgId: query.orgId };

    if (query.module?.length) {
      where.module = { in: query.module.map((m) => m.toUpperCase()) };
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
}
