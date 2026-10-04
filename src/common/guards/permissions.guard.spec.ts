import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard, type RequestUser } from './permissions.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import type { PermissionsMetadata } from '../decorators/require-permissions.decorator';

const USER: RequestUser = {
  id: 1,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeContext(options: {
  user?: RequestUser;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
}): ExecutionContext {
  const request = {
    user: options.user,
    query: options.query ?? {},
    params: options.params ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function makeGuard(options: {
  isPublic?: boolean;
  metadata?: PermissionsMetadata;
  membership?: { memberId: number; roleId: number; rules: Set<string> } | null;
  prismaOverrides?: Record<
    string,
    { findUnique?: jest.Mock; findFirst?: jest.Mock }
  >;
}) {
  const getAllAndOverride = jest
    .fn()
    .mockReturnValueOnce(options.isPublic ?? false)
    .mockReturnValueOnce(options.metadata);
  const reflector = { getAllAndOverride } as unknown as Reflector;

  const getMembership = jest
    .fn()
    .mockResolvedValue(
      options.membership === undefined ? null : options.membership,
    );
  const permissions = { getMembership } as unknown as PermissionsService;

  const prisma = {
    organizationSettings: { findUnique: jest.fn() },
    tag: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    member: { findUnique: jest.fn() },
    memberInvite: { findUnique: jest.fn() },
    ticketRequest: { findUnique: jest.fn() },
    ticket: { findFirst: jest.fn() },
    ticketComment: { findUnique: jest.fn() },
    ticketAttachment: { findUnique: jest.fn() },
    ...options.prismaOverrides,
  } as unknown as PrismaService;

  const guard = new PermissionsGuard(reflector, permissions, prisma);
  return { guard, prisma, getMembership };
}

describe('PermissionsGuard', () => {
  it('allows a @Public() route through without checking anything else', async () => {
    const { guard } = makeGuard({ isPublic: true });
    const context = makeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows a route with no @RequirePermissions() metadata through', async () => {
    const { guard } = makeGuard({ metadata: undefined });
    const context = makeContext({ user: USER });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws when the route requires permissions but request.user is unset', async () => {
    const { guard } = makeGuard({ metadata: { allOf: [] } });
    const context = makeContext({ query: { orgId: '5' } });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Not authenticated.',
    );
  });

  describe('org scope resolution', () => {
    it('defaults to query.orgId when no resource is specified', async () => {
      const { guard } = makeGuard({
        metadata: { allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
      });
      const context = makeContext({ user: USER, query: { orgId: '5' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws NotFoundException when query.orgId is missing', async () => {
      const { guard } = makeGuard({ metadata: { resource: 'query.orgId' } });
      const context = makeContext({ user: USER, query: {} });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when query.orgId is not numeric', async () => {
      const { guard } = makeGuard({ metadata: { resource: 'query.orgId' } });
      const context = makeContext({ user: USER, query: { orgId: 'abc' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reads orgId from the route param for param.orgId', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'param.orgId', allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
      });
      const context = makeContext({ user: USER, params: { orgId: '9' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('resolves param.slug by looking up the org settings row', async () => {
      const { guard, prisma } = makeGuard({
        metadata: { resource: 'param.slug', allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
      });
      (prisma.organizationSettings.findUnique as jest.Mock).mockResolvedValue({
        orgId: 3,
      });
      const context = makeContext({ user: USER, params: { slug: 'acme' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('treats a missing slug param as an empty-string lookup', async () => {
      const { guard, prisma } = makeGuard({
        metadata: { resource: 'param.slug' },
      });
      (prisma.organizationSettings.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const context = makeContext({ user: USER, params: {} });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.organizationSettings.findUnique).toHaveBeenCalledWith({
        where: { slug: '' },
        select: { orgId: true },
      });
    });

    it('throws NotFoundException when the slug does not resolve to an org', async () => {
      const { guard, prisma } = makeGuard({
        metadata: { resource: 'param.slug' },
      });
      (prisma.organizationSettings.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const context = makeContext({ user: USER, params: { slug: 'ghost' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('membership and rule checks', () => {
    it('throws when the caller has no membership in the resolved org', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'query.orgId', allOf: [] },
        membership: null,
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'You are not a member of this organization.',
      );
    });

    it('throws when an allOf rule is missing', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'query.orgId', allOf: ['tag.add'] },
        membership: { memberId: 1, roleId: 1, rules: new Set(['tag.view']) },
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        "You don't have permission to do this.",
      );
    });

    it('passes when every allOf rule is present', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'query.orgId', allOf: ['tag.add', 'tag.view'] },
        membership: {
          memberId: 1,
          roleId: 1,
          rules: new Set(['tag.add', 'tag.view']),
        },
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws when none of the anyOf rules are present', async () => {
      const { guard } = makeGuard({
        metadata: {
          resource: 'query.orgId',
          anyOf: ['ticket.view.all', 'ticket.view.included'],
        },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        "You don't have permission to do this.",
      );
    });

    it('passes when at least one anyOf rule is present', async () => {
      const { guard } = makeGuard({
        metadata: {
          resource: 'query.orgId',
          anyOf: ['ticket.view.all', 'ticket.view.included'],
        },
        membership: {
          memberId: 1,
          roleId: 1,
          rules: new Set(['ticket.view.included']),
        },
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('passes with just active membership when neither allOf nor anyOf is set', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'query.orgId' },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
      });
      const context = makeContext({ user: USER, query: { orgId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('single-resource lookups', () => {
    it.each([
      ['tag.tagId', 'tagId', 'tag', { orgId: 4 }],
      ['project.projectId', 'projectId', 'project', { orgId: 4 }],
      ['role.roleId', 'roleId', 'role', { orgId: 4 }],
      ['member.memberId', 'memberId', 'member', { orgId: 4 }],
      ['memberInvite.inviteId', 'inviteId', 'memberInvite', { orgId: 4 }],
      ['ticketRequest.requestId', 'requestId', 'ticketRequest', { orgId: 4 }],
    ] as const)(
      "resolves %s to the resource's orgId",
      async (resource, paramName, modelKey, row) => {
        const { guard, prisma } = makeGuard({
          metadata: { resource, allOf: [] },
          membership: { memberId: 1, roleId: 1, rules: new Set() },
          prismaOverrides: {
            [modelKey]: { findUnique: jest.fn().mockResolvedValue(row) },
          },
        });
        const context = makeContext({
          user: USER,
          params: { [paramName]: '9' },
        });
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(
          prisma[modelKey as keyof typeof prisma].findUnique,
        ).toHaveBeenCalled();
      },
    );

    it.each([
      ['tag.tagId', 'tagId', 'tag', 'Tag not found.'],
      ['project.projectId', 'projectId', 'project', 'Project not found.'],
      ['role.roleId', 'roleId', 'role', 'Role not found.'],
      ['member.memberId', 'memberId', 'member', 'Member not found.'],
      [
        'memberInvite.inviteId',
        'inviteId',
        'memberInvite',
        'Invite not found.',
      ],
      [
        'ticketRequest.requestId',
        'requestId',
        'ticketRequest',
        'Request not found.',
      ],
    ] as const)(
      'throws NotFoundException when the %s lookup finds nothing',
      async (resource, paramName, modelKey, message) => {
        const { guard } = makeGuard({
          metadata: { resource },
          prismaOverrides: {
            [modelKey]: { findUnique: jest.fn().mockResolvedValue(null) },
          },
        });
        const context = makeContext({
          user: USER,
          params: { [paramName]: '9' },
        });
        await expect(guard.canActivate(context)).rejects.toThrow(message);
      },
    );

    it('throws NotFoundException when a tag/role lookup resolves but has no orgId (a global template)', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'tag.tagId' },
        prismaOverrides: {
          tag: { findUnique: jest.fn().mockResolvedValue({ orgId: null }) },
        },
      });
      const context = makeContext({ user: USER, params: { tagId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Tag not found.',
      );
    });
  });

  describe('ticket scope resolution', () => {
    it('throws NotFoundException when the ticket does not exist', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticket.ticketId' },
        prismaOverrides: {
          ticket: { findFirst: jest.fn().mockResolvedValue(null) },
        },
      });
      const context = makeContext({ user: USER, params: { ticketId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Ticket not found.',
      );
    });

    it('checks org membership for an org-scoped ticket', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticket.ticketId', allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
        prismaOverrides: {
          ticket: {
            findFirst: jest.fn().mockResolvedValue({ orgId: 4, ownerId: null }),
          },
        },
      });
      const context = makeContext({ user: USER, params: { ticketId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it("allows a personal ticket's own owner through without a membership check", async () => {
      const { guard, getMembership } = makeGuard({
        metadata: { resource: 'ticket.ticketId', allOf: ['ticket.view.all'] },
        prismaOverrides: {
          ticket: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ orgId: null, ownerId: USER.id }),
          },
        },
      });
      const context = makeContext({ user: USER, params: { ticketId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(getMembership).not.toHaveBeenCalled();
    });

    it('throws when a personal ticket belongs to someone else', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticket.ticketId' },
        prismaOverrides: {
          ticket: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ orgId: null, ownerId: 999 }),
          },
        },
      });
      const context = makeContext({ user: USER, params: { ticketId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'This ticket is not yours.',
      );
    });

    it("resolves a comment to its parent ticket's scope", async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticketComment.commentId', allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
        prismaOverrides: {
          ticketComment: {
            findUnique: jest.fn().mockResolvedValue({ ticketId: 7 }),
          },
          ticket: {
            findFirst: jest.fn().mockResolvedValue({ orgId: 4, ownerId: null }),
          },
        },
      });
      const context = makeContext({ user: USER, params: { commentId: '1' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws NotFoundException when the comment itself does not exist', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticketComment.commentId' },
        prismaOverrides: {
          ticketComment: { findUnique: jest.fn().mockResolvedValue(null) },
        },
      });
      const context = makeContext({ user: USER, params: { commentId: '1' } });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Comment not found.',
      );
    });

    it("resolves an attachment to its parent ticket's scope", async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticketAttachment.attachmentId', allOf: [] },
        membership: { memberId: 1, roleId: 1, rules: new Set() },
        prismaOverrides: {
          ticketAttachment: {
            findUnique: jest.fn().mockResolvedValue({ ticketId: 7 }),
          },
          ticket: {
            findFirst: jest.fn().mockResolvedValue({ orgId: 4, ownerId: null }),
          },
        },
      });
      const context = makeContext({
        user: USER,
        params: { attachmentId: '1' },
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws NotFoundException when the attachment itself does not exist', async () => {
      const { guard } = makeGuard({
        metadata: { resource: 'ticketAttachment.attachmentId' },
        prismaOverrides: {
          ticketAttachment: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        },
      });
      const context = makeContext({
        user: USER,
        params: { attachmentId: '1' },
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Attachment not found.',
      );
    });
  });
});
