import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  type PermissionResource,
  type PermissionsMetadata,
} from '../decorators/require-permissions.decorator';
import { PermissionsService } from '../permissions/permissions.service';

export interface RequestUser {
  id: number;
  email: string;
  isVerified: boolean;
}

type AuthenticatedRequest = Request & { user?: RequestUser };

type Scope = { mode: 'org'; orgId: number } | { mode: 'authorized' };

/**
 * RBAC guard — registered globally in app.module.ts, after JwtAuthGuard (so
 * request.user is already populated by the time this runs). A route with
 * no `@RequirePermissions()` metadata is unaffected by it.
 *
 * Resolves which organization a request concerns via the route's declared
 * `resource` (see require-permissions.decorator.ts) — either directly from
 * a query/route param, or by looking up the referenced resource's owning
 * org — then checks the caller's Member row for that org against the
 * required rule(s). Tickets are a special case: a ticket is either
 * org-scoped (checked the normal way) or a "personal" ticket (owned
 * directly by a User, no org/role involved at all) — see resolveTicketScope.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const metadata = this.reflector.getAllAndOverride<PermissionsMetadata>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated.');

    const scope = await this.resolveScope(
      metadata.resource ?? 'query.orgId',
      request,
      user.id,
    );
    if (scope.mode === 'authorized') return true;

    const membership = await this.permissions.getMembership(
      user.id,
      scope.orgId,
    );
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    if (metadata.allOf?.some((rule) => !membership.rules.has(rule))) {
      throw new ForbiddenException("You don't have permission to do this.");
    }
    if (
      metadata.anyOf &&
      !metadata.anyOf.some((rule) => membership.rules.has(rule))
    ) {
      throw new ForbiddenException("You don't have permission to do this.");
    }

    return true;
  }

  private async resolveScope(
    resource: PermissionResource,
    request: Request,
    callerId: number,
  ): Promise<Scope> {
    switch (resource) {
      case 'query.orgId':
        return {
          mode: 'org',
          orgId: this.intFrom(request.query?.orgId, 'orgId'),
        };

      case 'param.orgId':
        return {
          mode: 'org',
          orgId: this.intFrom(request.params?.orgId, 'orgId'),
        };

      case 'param.slug': {
        const slug = String(request.params?.slug ?? '');
        const settings = await this.prisma.organizationSettings.findUnique({
          where: { slug },
          select: { orgId: true },
        });
        if (!settings) throw new NotFoundException('Organization not found.');
        return { mode: 'org', orgId: settings.orgId };
      }

      case 'tag.tagId': {
        const id = this.intFrom(request.params?.tagId, 'tagId');
        const tag = await this.prisma.tag.findUnique({
          where: { id },
          select: { orgId: true },
        });
        if (!tag || tag.orgId == null) {
          throw new NotFoundException('Tag not found.');
        }
        return { mode: 'org', orgId: tag.orgId };
      }

      case 'role.roleId': {
        const id = this.intFrom(request.params?.roleId, 'roleId');
        const role = await this.prisma.role.findUnique({
          where: { id },
          select: { orgId: true },
        });
        if (!role || role.orgId == null) {
          throw new NotFoundException('Role not found.');
        }
        return { mode: 'org', orgId: role.orgId };
      }

      case 'member.memberId': {
        const id = this.intFrom(request.params?.memberId, 'memberId');
        const member = await this.prisma.member.findUnique({
          where: { id },
          select: { orgId: true },
        });
        if (!member) throw new NotFoundException('Member not found.');
        return { mode: 'org', orgId: member.orgId };
      }

      case 'memberInvite.inviteId': {
        const id = this.intFrom(request.params?.inviteId, 'inviteId');
        const invite = await this.prisma.memberInvite.findUnique({
          where: { id },
          select: { orgId: true },
        });
        if (!invite) throw new NotFoundException('Invite not found.');
        return { mode: 'org', orgId: invite.orgId };
      }

      case 'ticketRequest.requestId': {
        const id = this.intFrom(request.params?.requestId, 'requestId');
        const ticketRequest = await this.prisma.ticketRequest.findUnique({
          where: { id },
          select: { orgId: true },
        });
        if (!ticketRequest) throw new NotFoundException('Request not found.');
        return { mode: 'org', orgId: ticketRequest.orgId };
      }

      case 'ticket.ticketId':
        return this.resolveTicketScope(
          this.intFrom(request.params?.ticketId, 'ticketId'),
          callerId,
        );

      case 'ticketComment.commentId': {
        const id = this.intFrom(request.params?.commentId, 'commentId');
        const comment = await this.prisma.ticketComment.findUnique({
          where: { id },
          select: { ticketId: true },
        });
        if (!comment) throw new NotFoundException('Comment not found.');
        return this.resolveTicketScope(comment.ticketId, callerId);
      }

      case 'ticketAttachment.attachmentId': {
        const id = this.intFrom(request.params?.attachmentId, 'attachmentId');
        const attachment = await this.prisma.ticketAttachment.findUnique({
          where: { id },
          select: { ticketId: true },
        });
        if (!attachment) throw new NotFoundException('Attachment not found.');
        return this.resolveTicketScope(attachment.ticketId, callerId);
      }
    }
  }

  /** A ticket is either org-scoped (orgId set — checked against the
   * caller's Member/Role like any other org resource) or "personal"
   * (ownerId set instead, no org/role involved) — in which case only the
   * ticket's own owner may act on it at all, and Rule-based anyOf/allOf
   * on the route metadata don't apply. */
  private async resolveTicketScope(
    ticketId: number,
    callerId: number,
  ): Promise<Scope> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, isDeleted: false },
      select: { orgId: true, ownerId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    if (ticket.orgId != null) return { mode: 'org', orgId: ticket.orgId };

    if (ticket.ownerId !== callerId) {
      throw new ForbiddenException('This ticket is not yours.');
    }
    return { mode: 'authorized' };
  }

  private intFrom(raw: unknown, name: string): number {
    const id = Number(raw);
    if (raw == null || raw === '' || Number.isNaN(id)) {
      throw new NotFoundException(`Missing or invalid ${name}.`);
    }
    return id;
  }
}
