import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { formatReferenceId } from '../../common/helper/reference-id.helper';
import { retryOnUniqueConflict } from '../../common/helper/retry-on-conflict.helper';
import { PUBLIC_USER_SELECT } from '../../common/helper/public-user-select.helper';
import { assertCapacity } from '../../common/helper/assert-capacity.helper';
import type { TicketQueryDto } from './dto/ticket-query.dto';
import type { CountNumbersQueryDto } from './dto/count-numbers-query.dto';
import type { CreateTicketDto } from './dto/create-ticket.dto';
import type { UpdateTicketDto } from './dto/update-ticket.dto';
import type { UpdateTicketTagDto } from './dto/update-ticket-tag.dto';
import type { UpdateTicketAssigneesDto } from './dto/update-ticket-assignees.dto';
import type { UpdateTicketStarDto } from './dto/update-ticket-star.dto';
import type { AddCommentDto } from './dto/add-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';
import type { PersonalTicketQueryDto } from './dto/personal-ticket-query.dto';
import type { PersonalCountNumbersQueryDto } from './dto/personal-count-numbers-query.dto';
import type { CreatePersonalTicketDto } from './dto/create-personal-ticket.dto';

const TICKET_MUTATION_INCLUDE = {
  tag: true,
  project: true,
  client: { include: { user: { select: PUBLIC_USER_SELECT } } },
  assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
} as const;

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
    callerId: number,
    filterBy?: string[],
    involvesUserId?: number,
  ) {
    const where: Prisma.TicketWhereInput = { ...scope, isDeleted: false };

    if (filterBy?.includes('overdue')) {
      where.dueDate = { lt: new Date() };
    }
    // Starring is per-caller (see TicketStarred) — "starred" here always
    // means "starred by whoever is asking", never a global flag.
    if (filterBy?.includes('starred')) {
      where.starredBy = { some: { userId: callerId } };
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

  /** Attaches each ticket's `starred` flag — true iff `callerId` has
   * personally starred it — without touching the query that fetched the
   * tickets themselves. One extra query for the whole page, not one per
   * ticket. */
  private async attachStarred<T extends { id: number }>(
    tickets: T[],
    callerId: number,
  ): Promise<(T & { starred: boolean })[]> {
    if (tickets.length === 0) return [];
    const starredRows = await this.prisma.ticketStarred.findMany({
      where: { userId: callerId, ticketId: { in: tickets.map((t) => t.id) } },
      select: { ticketId: true },
    });
    const starredIds = new Set(starredRows.map((row) => row.ticketId));
    return tickets.map((t) => ({ ...t, starred: starredIds.has(t.id) }));
  }

  /** Same as attachStarred, for a single ticket (details/update/etc. —
   * anywhere a lookup by the unique (userId, ticketId) pair is cheaper
   * than the IN-list form above). */
  private async attachStarredOne<T extends { id: number }>(
    ticket: T,
    callerId: number,
  ): Promise<T & { starred: boolean }> {
    const row = await this.prisma.ticketStarred.findUnique({
      where: { userId_ticketId: { userId: callerId, ticketId: ticket.id } },
      select: { ticketId: true },
    });
    return { ...ticket, starred: row != null };
  }

  async countNumbers(query: CountNumbersQueryDto, callerId: number) {
    const where = this.ticketWhere(
      { orgId: query.orgId },
      callerId,
      query.filterBy,
      query.involvesUserId,
    );
    if (query.projectIds?.length) {
      where.projectId = { in: query.projectIds };
    }
    return this.countNumbersForWhere(where, query, { orgId: query.orgId });
  }

  /** Personal tickets use the fixed global tag templates (orgId: null),
   * not an org's own tags. */
  async countNumbersPersonal(
    userId: number,
    query: PersonalCountNumbersQueryDto,
  ) {
    const where = this.ticketWhere({ ownerId: userId }, userId, query.filterBy);
    return this.countNumbersForWhere(where, query, { orgId: null });
  }

  private async countNumbersForWhere(
    where: Prisma.TicketWhereInput,
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
  async allForOrg(orgId: number, callerId: number, involvesUserId?: number) {
    const where = this.ticketWhere(
      { orgId },
      callerId,
      undefined,
      involvesUserId,
    );
    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tag: true,
        project: true,
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
    return this.attachStarred(tickets, callerId);
  }

  /** Same shape as allForOrg, for a personal (org-less) space — no
   * client/assignees exist without an org, but the include stays so the
   * response shape matches what Dashboard/Reports already expect. */
  async allForOwner(userId: number) {
    const where = this.ticketWhere({ ownerId: userId }, userId);
    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tag: true,
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
    return this.attachStarred(tickets, userId);
  }

  async recent(orgId: number, callerId: number) {
    const [tickets, requests] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { orgId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { tag: true, project: true },
      }),
      this.prisma.ticketRequest.findMany({
        where: { orgId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    return { tickets: await this.attachStarred(tickets, callerId), requests };
  }

  async list(query: TicketQueryDto, callerId: number) {
    const where = this.ticketWhere(
      { orgId: query.orgId },
      callerId,
      query.filterBy,
      query.involvesUserId,
    );
    if (query.memberIds?.length) {
      where.assignees = { some: { id: { in: query.memberIds } } };
    }
    if (query.projectIds?.length) {
      where.projectId = { in: query.projectIds };
    }
    return this.listForWhere(where, query, callerId);
  }

  /** Same as list(), minus the memberIds filter — a personal ticket has
   * no assignees, since there's no org membership to assign from. */
  async listPersonal(userId: number, query: PersonalTicketQueryDto) {
    const where = this.ticketWhere({ ownerId: userId }, userId, query.filterBy);
    return this.listForWhere(where, query, userId);
  }

  private async listForWhere(
    where: Prisma.TicketWhereInput,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      dueDateFrom?: string;
      dueDateTo?: string;
    },
    callerId: number,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;

    if (query.search?.trim()) {
      const term = query.search.trim();
      // A plain `where.OR` here would clobber the OR block ticketWhere()
      // may have already set for involvesUserId scoping (only one OR key
      // per object) — nesting under AND keeps both conditions in force.
      const existingAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      where.AND = [
        ...existingAnd,
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { referenceId: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (query.dueDateFrom || query.dueDateTo) {
      // dueDate may already carry a `lt` from ticketWhere()'s "overdue"
      // filter — merge rather than clobber so both stay in force. The
      // instanceof guard excludes the plain-Date/string shorthand this
      // field's type also allows, neither of which this code ever sets.
      const existingDueDate =
        where.dueDate &&
        typeof where.dueDate === 'object' &&
        !(where.dueDate instanceof Date)
          ? where.dueDate
          : undefined;
      where.dueDate = {
        ...existingDueDate,
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
          project: true,
          client: { include: { user: { select: PUBLIC_USER_SELECT } } },
          assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
          attachments: true,
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items: await this.attachStarred(items, callerId),
      total,
      page,
      limit,
    };
  }

  async details(ticketId: number, callerId: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, isDeleted: false },
      include: {
        tag: true,
        project: true,
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          include: { author: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return this.attachStarredOne(ticket, callerId);
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

    // existingCount above deliberately includes soft-deleted tickets (it's
    // just numbering the next reference id) — capacity cares about how
    // many are actually active right now, a different count.
    const activeCount = await this.prisma.ticket.count({
      where: { orgId, isDeleted: false },
    });
    await assertCapacity(this.prisma, orgId, 'tickets', activeCount, 'Ticket');

    const ticket = await this.prisma.ticket.create({
      data: {
        orgId,
        referenceId,
        title: dto.title,
        description: dto.description,
        tagId: dto.tagId,
        clientId: dto.clientId,
        projectId: dto.projectId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignees: dto.assigneeIds
          ? { connect: dto.assigneeIds.map((id) => ({ id })) }
          : undefined,
        attachments: dto.attachments ? { create: dto.attachments } : undefined,
      },
      include: {
        tag: true,
        project: true,
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
      },
    });
    // A brand-new ticket provably has no TicketStarred row yet.
    return { ...ticket, starred: false };
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

    const ticket = await this.prisma.ticket.create({
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
    return { ...ticket, starred: false };
  }

  async update(ticketId: number, dto: UpdateTicketDto, callerId: number) {
    await this.findOrThrow(ticketId);

    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate
              ? new Date(dto.dueDate)
              : null,
        projectId: dto.projectId === undefined ? undefined : dto.projectId,
      },
      include: TICKET_MUTATION_INCLUDE,
    });
    return this.attachStarredOne(ticket, callerId);
  }

  // tagId doubles as "status" in this app (see the schema's Ticket.tagId
  // comment) — gated by ticket.change.tag, separately from the rest of a
  // ticket's fields under ticket.update.
  async updateTag(ticketId: number, dto: UpdateTicketTagDto, callerId: number) {
    await this.findOrThrow(ticketId);
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { tagId: dto.tagId },
      include: TICKET_MUTATION_INCLUDE,
    });
    return this.attachStarredOne(ticket, callerId);
  }

  async updateAssignees(
    ticketId: number,
    dto: UpdateTicketAssigneesDto,
    callerId: number,
  ) {
    await this.findOrThrow(ticketId);
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assignees: { set: dto.assigneeIds.map((id) => ({ id })) } },
      include: TICKET_MUTATION_INCLUDE,
    });
    return this.attachStarredOne(ticket, callerId);
  }

  // Starring is a personal bookmark, not an edit to the ticket's actual
  // content — no ticket.update permission required, just view access
  // (enforced at the route, see ticket.controller.ts). It's also per-user
  // (see TicketStarred), so this upserts/deletes the caller's own row
  // instead of touching the ticket itself.
  async updateStar(
    ticketId: number,
    dto: UpdateTicketStarDto,
    callerId: number,
  ) {
    const ticket = await this.findOrThrow(ticketId);

    if (dto.starred) {
      await this.prisma.ticketStarred.upsert({
        where: { userId_ticketId: { userId: callerId, ticketId } },
        create: { userId: callerId, ticketId },
        update: {},
      });
    } else {
      await this.prisma.ticketStarred.deleteMany({
        where: { userId: callerId, ticketId },
      });
    }

    const full = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: TICKET_MUTATION_INCLUDE,
    });
    return { ...full, starred: dto.starred };
  }

  async remove(ticketId: number) {
    await this.findOrThrow(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { isDeleted: true },
    });
  }

  async addComment(ticketId: number, authorId: number, dto: AddCommentDto) {
    await this.findOrThrow(ticketId);

    return this.prisma.ticketComment.create({
      data: { ticketId, userId: authorId, comment: dto.comment },
      include: { author: true },
    });
  }

  // "At any circumstances a user can only edit its own comment" — no role,
  // including Superadmin, bypasses this. Enforced here rather than only at
  // the route (ticket.edit.comment gates *whether* you can edit a comment
  // at all; this gates *which* comments, which no Rule can express).
  async updateComment(
    commentId: number,
    callerId: number,
    dto: UpdateCommentDto,
  ) {
    const comment = await this.findCommentOrThrow(commentId);
    if (comment.userId !== callerId) {
      throw new ForbiddenException('You can only edit your own comments.');
    }
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

  async removeComment(commentId: number, callerId: number) {
    const comment = await this.findCommentOrThrow(commentId);
    if (comment.userId !== callerId) {
      throw new ForbiddenException('You can only remove your own comments.');
    }
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
