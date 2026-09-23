import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { formatReferenceId } from '../../common/helper/reference-id.helper';
import { retryOnUniqueConflict } from '../../common/helper/retry-on-conflict.helper';
import type { TicketQueryDto } from './dto/ticket-query.dto';
import type { CountNumbersQueryDto } from './dto/count-numbers-query.dto';
import type { CreateTicketDto } from './dto/create-ticket.dto';
import type { UpdateTicketDto } from './dto/update-ticket.dto';
import type { AddCommentDto } from './dto/add-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';
import type { PersonalTicketQueryDto } from './dto/personal-ticket-query.dto';
import type { PersonalCountNumbersQueryDto } from './dto/personal-count-numbers-query.dto';
import type { CreatePersonalTicketDto } from './dto/create-personal-ticket.dto';

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

/** A ticket belongs to exactly one of these — an org, or (for a
 * "personal", org-less ticket) its owning user. */
type TicketScope = { orgId: number } | { ownerId: number };

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  private ticketWhere(
    scope: TicketScope,
    filterBy?: string[],
    involvesUserId?: number,
  ) {
    const where: any = { ...scope, isDeleted: false };

    if (filterBy?.includes('overdue')) {
      where.dueDate = { lt: new Date() };
    }
    if (filterBy?.includes('starred')) {
      where.starred = true;
    }

    const tagIds = (filterBy ?? []).filter(isNumeric).map(Number);
    if (tagIds.length > 0) where.tagId = { in: tagIds };

    if (involvesUserId) {
      where.OR = [
        { client: { userId: involvesUserId } },
        { assignees: { some: { userId: involvesUserId } } },
      ];
    }

    return where;
  }

  async countNumbers(query: CountNumbersQueryDto) {
    const where = this.ticketWhere(
      { orgId: query.orgId },
      query.filterBy,
      query.involvesUserId,
    );
    return this.countNumbersForWhere(where, query, { orgId: query.orgId });
  }

  /** Personal tickets use the fixed global tag templates (orgId: null),
   * not an org's own tags. */
  async countNumbersPersonal(
    userId: number,
    query: PersonalCountNumbersQueryDto,
  ) {
    const where = this.ticketWhere({ ownerId: userId }, query.filterBy);
    return this.countNumbersForWhere(where, query, { orgId: null });
  }

  private async countNumbersForWhere(
    where: any,
    dateRange: { dateFrom?: string; dateTo?: string },
    tagsWhere: { orgId: number | null },
  ) {
    if (dateRange.dateFrom || dateRange.dateTo) {
      where.createdAt = {
        ...(dateRange.dateFrom ? { gte: new Date(dateRange.dateFrom) } : {}),
        ...(dateRange.dateTo ? { lte: new Date(dateRange.dateTo) } : {}),
      };
    }

    // One groupBy instead of one count() per tag — same result, but a
    // fixed 4 queries total regardless of how many tags the org has,
    // instead of 3 + N.
    const [total, overdues, tags, tagCounts] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.count({
        where: { ...where, dueDate: { lt: new Date() } },
      }),
      this.prisma.tag.findMany({
        where: { ...tagsWhere, isDeleted: false },
      }),
      this.prisma.ticket.groupBy({
        by: ['tagId'],
        where,
        _count: { _all: true },
      }),
    ]);

    const countByTagId = new Map(
      tagCounts.map((row) => [row.tagId, row._count._all]),
    );
    const countPerTag = tags.map((tag) => ({
      tagId: tag.id,
      tagName: tag.tagName,
      color: tag.color,
      count: countByTagId.get(tag.id) ?? 0,
    }));

    return {
      totalTickets: total,
      overdues,
      onTime: total - overdues,
      countPerTag,
    };
  }

  /**
   * Every non-deleted ticket for the org, unpaginated — used by
   * Dashboard/Reports, which need row-level data (createdAt, dueDate, tag,
   * assignees) to compute flexible client-side aggregations (trend charts,
   * month/year comparison, assignee breakdown) that a fixed set of
   * pre-aggregated endpoints can't cover. Skips attachments/comments since
   * none of those views render them.
   */
  async allForOrg(orgId: number, involvesUserId?: number) {
    const where = this.ticketWhere({ orgId }, undefined, involvesUserId);
    return this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tag: true,
        client: { include: { user: true } },
        assignees: { include: { user: true } },
      },
    });
  }

  /** Same shape as allForOrg, for a personal (org-less) space — no
   * client/assignees exist without an org, but the include stays so the
   * response shape matches what Dashboard/Reports already expect. */
  async allForOwner(userId: number) {
    const where = this.ticketWhere({ ownerId: userId });
    return this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tag: true,
        client: { include: { user: true } },
        assignees: { include: { user: true } },
      },
    });
  }

  async recent(orgId: number) {
    const [tickets, requests] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { orgId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { tag: true },
      }),
      this.prisma.ticketRequest.findMany({
        where: { orgId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    return { tickets, requests };
  }

  async list(query: TicketQueryDto) {
    const where = this.ticketWhere(
      { orgId: query.orgId },
      query.filterBy,
      query.involvesUserId,
    );
    if (query.memberIds?.length) {
      where.assignees = { some: { id: { in: query.memberIds } } };
    }
    return this.listForWhere(where, query);
  }

  /** Same as list(), minus the memberIds filter — a personal ticket has
   * no assignees, since there's no org membership to assign from. */
  async listPersonal(userId: number, query: PersonalTicketQueryDto) {
    const where = this.ticketWhere({ ownerId: userId }, query.filterBy);
    return this.listForWhere(where, query);
  }

  private async listForWhere(
    where: any,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      dueDateFrom?: string;
      dueDateTo?: string;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;

    if (query.search?.trim()) {
      const term = query.search.trim();
      // A plain `where.OR` here would clobber the OR block ticketWhere()
      // may have already set for involvesUserId scoping (only one OR key
      // per object) — nesting under AND keeps both conditions in force.
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { referenceId: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {
        ...where.dueDate,
        ...(query.dueDateFrom ? { gte: new Date(query.dueDateFrom) } : {}),
        ...(query.dueDateTo ? { lte: new Date(query.dueDateTo) } : {}),
      };
    }

    // NOTE: the client-masking rule ("if the requestor isn't the owner or
    // this ticket's own client, return { firstName: 'client', lastName:
    // 'client' }") needs to know who's asking. There's no authenticated
    // caller yet (see PermissionsGuard's header comment), so it isn't
    // applied here — every caller currently sees the real client.
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          tag: true,
          client: { include: { user: true } },
          assignees: { include: { user: true } },
          attachments: true,
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async details(ticketId: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, isDeleted: false },
      include: {
        tag: true,
        client: { include: { user: true } },
        assignees: { include: { user: true } },
        attachments: true,
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          include: { author: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  async create(orgId: number, dto: CreateTicketDto) {
    // referenceId comes from "count existing rows, use count+1" — not
    // atomic with the insert, so two concurrent creates in the same org
    // can race for the same number. Recompute and retry on that specific
    // conflict rather than failing the request outright.
    return retryOnUniqueConflict(() => this.createTicket(orgId, dto));
  }

  private async createTicket(orgId: number, dto: CreateTicketDto) {
    const existingCount = await this.prisma.ticket.count({ where: { orgId } });
    const referenceId = formatReferenceId('tckt', existingCount);

    return this.prisma.ticket.create({
      data: {
        orgId,
        referenceId,
        title: dto.title,
        description: dto.description,
        tagId: dto.tagId,
        clientId: dto.clientId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignees: dto.assigneeIds
          ? { connect: dto.assigneeIds.map((id) => ({ id })) }
          : undefined,
        attachments: dto.attachments ? { create: dto.attachments } : undefined,
      },
      include: {
        tag: true,
        client: { include: { user: true } },
        assignees: { include: { user: true } },
        attachments: true,
      },
    });
  }

  async createPersonal(userId: number, dto: CreatePersonalTicketDto) {
    // Same race as create() above, scoped by ownerId+referenceId instead
    // of orgId+referenceId — see the schema's unique constraints.
    return retryOnUniqueConflict(() => this.createPersonalTicket(userId, dto));
  }

  private async createPersonalTicket(
    userId: number,
    dto: CreatePersonalTicketDto,
  ) {
    const existingCount = await this.prisma.ticket.count({
      where: { ownerId: userId },
    });
    const referenceId = formatReferenceId('tckt', existingCount);

    return this.prisma.ticket.create({
      data: {
        ownerId: userId,
        referenceId,
        title: dto.title,
        description: dto.description,
        tagId: dto.tagId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        attachments: dto.attachments ? { create: dto.attachments } : undefined,
      },
      include: {
        tag: true,
        attachments: true,
      },
    });
  }

  async update(ticketId: number, dto: UpdateTicketDto) {
    await this.findOrThrow(ticketId);

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        title: dto.title,
        description: dto.description,
        tagId: dto.tagId,
        starred: dto.starred,
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate
              ? new Date(dto.dueDate)
              : null,
        assignees: dto.assigneeIds
          ? { set: dto.assigneeIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        tag: true,
        client: { include: { user: true } },
        assignees: { include: { user: true } },
      },
    });
  }

  async remove(ticketId: number) {
    await this.findOrThrow(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { isDeleted: true },
    });
  }

  async addComment(ticketId: number, dto: AddCommentDto) {
    await this.findOrThrow(ticketId);

    try {
      return await this.prisma.ticketComment.create({
        data: { ticketId, userId: dto.userId, comment: dto.comment },
        include: { author: true },
      });
    } catch (error) {
      // The global filter already turns a P2003 into a clean 400, but
      // "userId does not exist" is easy to hit here specifically (no auth
      // yet, so the caller supplies userId by hand — see AddCommentDto),
      // so it's worth a clearer message and a log line naming which
      // ticket/user combo failed.
      this.logger.warn(
        `Failed to add comment: ticketId=${ticketId} userId=${dto.userId}`,
      );
      throw error;
    }
  }

  async updateComment(commentId: number, dto: UpdateCommentDto) {
    await this.findCommentOrThrow(commentId);
    return this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { comment: dto.comment },
      // Needed for the frontend's adaptComment(), same as addComment()
      // above — without it, this response has no `author`, which throws
      // when adaptComment reads `c.author.id` and silently drops the
      // edit from the UI (the write itself still succeeds).
      include: { author: true },
    });
  }

  async addAttachment(ticketId: number, file: Express.Multer.File) {
    await this.findOrThrow(ticketId);
    const uploaded = await this.s3.upload(file);

    return this.prisma.ticketAttachment.create({
      data: {
        ticketId,
        name: file.originalname,
        url: uploaded.url,
        size: file.size,
      },
    });
  }

  async removeAttachment(attachmentId: number) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });

    // Best-effort — the DB row (now gone) is what the UI actually
    // reflects, so a failed/already-missing S3 object shouldn't fail
    // the request. See S3Service.delete().
    await this.s3.delete(attachment.url);

    return attachment;
  }

  async removeComment(commentId: number) {
    await this.findCommentOrThrow(commentId);
    return this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });
  }

  private async findOrThrow(ticketId: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, isDeleted: false },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  private async findCommentOrThrow(commentId: number) {
    const comment = await this.prisma.ticketComment.findFirst({
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) throw new NotFoundException('Comment not found.');
    return comment;
  }
}
