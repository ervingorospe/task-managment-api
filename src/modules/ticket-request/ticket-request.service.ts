import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../../common/helper/public-user-select.helper';
import { PermissionsService } from '../../common/permissions/permissions.service';
import {
  PERMISSIONS,
  type Permission,
} from '../../common/permissions/permissions.constant';
import { formatReferenceId } from '../../common/helper/reference-id.helper';
import { retryOnUniqueConflict } from '../../common/helper/retry-on-conflict.helper';
import type { RequestQueryDto } from './dto/request-query.dto';
import type { CreateRequestDto } from './dto/create-request.dto';
import type { UpdateRequestDto } from './dto/update-request.dto';
import type { RejectRequestDto } from './dto/reject-request.dto';
import type { ApproveRequestDto } from './dto/approve-request.dto';

const VALID_REQUEST_STATUSES = new Set<string>(Object.values(RequestStatus));

function isRequestStatus(value: string): value is RequestStatus {
  return VALID_REQUEST_STATUSES.has(value);
}

@Injectable()
export class TicketRequestService {
  private readonly logger = new Logger(TicketRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(query: RequestQueryDto) {
    const where: Prisma.TicketRequestWhereInput = {
      orgId: query.orgId,
      isDeleted: false,
    };
    if (query.filterBy?.length) {
      const statuses = query.filterBy
        .map((s) => s.toUpperCase())
        .filter(isRequestStatus);
      if (statuses.length) where.status = { in: statuses };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 15;

    const [items, total] = await Promise.all([
      this.prisma.ticketRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        },
      }),
      this.prisma.ticketRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Every non-deleted request for the org, unpaginated — the
   * ticket-request counterpart to TicketService.allForOrg(), used by
   * Dashboard/Reports for the same reason. */
  async allForOrg(orgId: number, involvesUserId?: number) {
    const where: Prisma.TicketRequestWhereInput = { orgId, isDeleted: false };
    if (involvesUserId) where.client = { userId: involvesUserId };

    return this.prisma.ticketRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
  }

  async details(requestId: number) {
    const request = await this.prisma.ticketRequest.findFirst({
      where: { id: requestId, isDeleted: false },
      include: {
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
      },
    });
    if (!request) throw new NotFoundException('Request not found.');
    return request;
  }

  async create(orgId: number, callerId: number, dto: CreateRequestDto) {
    const client = await this.prisma.member.findFirst({
      where: { id: dto.clientId, orgId, isDeleted: false },
      include: { role: true },
    });
    if (!client)
      throw new NotFoundException('Member not found in this organization.');

    // Checked by role NAME, intentionally — not a permission — so
    // Superadmin/Owner can't submit a request just because a wildcard
    // permission would otherwise let them bypass this.
    if (client.role.roleName !== 'Client') {
      throw new ForbiddenException(
        'Only members with the Client role can submit a request.',
      );
    }

    // request.own.create covers submitting your own request; creating one
    // on behalf of a *different* client needs request.all.create
    // specifically — the route's anyOf only guarantees the caller has one
    // of the two, not which.
    await this.assertAllPermissionIfNotOwn(
      callerId,
      orgId,
      client.userId === callerId,
      PERMISSIONS.REQUEST_ALL_CREATE,
    );

    // Same non-atomic "count then create" race as tickets — recompute and
    // retry on a referenceId collision instead of failing the request.
    return retryOnUniqueConflict(async () => {
      const existingCount = await this.prisma.ticketRequest.count({
        where: { orgId },
      });
      const referenceId = formatReferenceId('req', existingCount);

      return this.prisma.ticketRequest.create({
        data: {
          orgId,
          referenceId,
          title: dto.title,
          description: dto.description,
          clientId: dto.clientId,
          attachments: dto.attachments
            ? { create: dto.attachments }
            : undefined,
        },
        include: {
          client: { include: { user: { select: PUBLIC_USER_SELECT } } },
          attachments: true,
        },
      });
    });
  }

  async update(requestId: number, callerId: number, dto: UpdateRequestDto) {
    const request = await this.findPendingOrThrow(requestId);
    await this.assertAllPermissionIfNotOwn(
      callerId,
      request.orgId,
      await this.isOwnRequest(request.clientId, callerId),
      PERMISSIONS.REQUEST_ALL_UPDATE,
    );

    return this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: { title: dto.title, description: dto.description },
      include: {
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
      },
    });
  }

  async reject(requestId: number, dto: RejectRequestDto) {
    const request = await this.findPendingOrThrow(requestId);
    return this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', remarks: dto.remarks },
      // Same fix as approve() below — without this the response has no
      // `client`, which throws in the frontend's adaptTicketRequest() and
      // shows a false "failed to reject" even though it succeeded.
      include: {
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
      },
    });
  }

  async cancel(requestId: number, callerId: number) {
    const request = await this.findPendingOrThrow(requestId);
    await this.assertAllPermissionIfNotOwn(
      callerId,
      request.orgId,
      await this.isOwnRequest(request.clientId, callerId),
      PERMISSIONS.REQUEST_ALL_CANCEL,
    );

    return this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
      include: {
        client: { include: { user: { select: PUBLIC_USER_SELECT } } },
        attachments: true,
      },
    });
  }

  async approve(requestId: number, dto: ApproveRequestDto) {
    const request = await this.findPendingOrThrow(requestId);
    const requestWithAttachments =
      await this.prisma.ticketRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { attachments: true },
      });

    try {
      // Retries the whole transaction on a referenceId collision (same
      // non-atomic count-then-create race as plain ticket creation) — a
      // losing transaction rolls back cleanly, so recomputing and retrying
      // is safe.
      return await retryOnUniqueConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const existingCount = await tx.ticket.count({
            where: { orgId: request.orgId },
          });
          const referenceId = formatReferenceId('tckt', existingCount);

          const ticket = await tx.ticket.create({
            data: {
              orgId: request.orgId,
              referenceId,
              title: request.title,
              description: request.description,
              tagId: dto.tagId,
              clientId: request.clientId,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
              assignees: dto.assigneeIds
                ? { connect: dto.assigneeIds.map((id) => ({ id })) }
                : undefined,
              attachments: {
                create: requestWithAttachments.attachments.map((a) => ({
                  name: a.name,
                  url: a.url,
                  size: a.size,
                })),
              },
            },
            include: {
              tag: true,
              client: { include: { user: { select: PUBLIC_USER_SELECT } } },
              assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
              attachments: true,
            },
          });

          const updatedRequest = await tx.ticketRequest.update({
            where: { id: request.id },
            data: { status: 'APPROVED', ticketId: ticket.id },
            // Needed for the frontend's adaptTicketRequest(), same as the
            // list()/details() reads above — without it, this response
            // has no `client`, which throws when adaptMember(r.client)
            // reads it and silently surfaces as a false "failed to
            // approve" even though the DB write succeeded.
            include: {
              client: { include: { user: { select: PUBLIC_USER_SELECT } } },
              attachments: true,
            },
          });

          return { request: updatedRequest, ticket };
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to approve request ${requestId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async isOwnRequest(clientId: number, callerId: number) {
    const client = await this.prisma.member.findUnique({
      where: { id: clientId },
      select: { userId: true },
    });
    return client?.userId === callerId;
  }

  /** The route's `anyOf: [ownPermission, allPermission]` only guarantees
   * the caller has *one* of the two — it can't tell which, or whether this
   * particular request is actually theirs. Acting on someone else's
   * request always needs the `all` permission specifically. */
  private async assertAllPermissionIfNotOwn(
    callerId: number,
    orgId: number,
    isOwn: boolean,
    allPermission: Permission,
  ) {
    if (isOwn) return;
    const membership = await this.permissions.getMembership(callerId, orgId);
    if (!membership?.rules.has(allPermission)) {
      throw new ForbiddenException(
        "You don't have permission to do this for another client's request.",
      );
    }
  }

  private async findPendingOrThrow(requestId: number) {
    const request = await this.prisma.ticketRequest.findFirst({
      where: { id: requestId, isDeleted: false },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('This request has already been resolved.');
    }
    return request;
  }
}
