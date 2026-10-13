import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { MailerService } from '../email/mailer.service';

function makeMailer(
  sendImpl: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  return { send: sendImpl } as unknown as MailerService;
}

function withOrgAndRole(prisma: ReturnType<typeof createMockPrisma>) {
  prisma.organization.findUnique.mockResolvedValue({
    id: 5,
    organizationName: 'Acme',
    settings: { logo: null },
  });
  prisma.role.findUnique.mockResolvedValue({ id: 2, roleName: 'Member' });
}

describe('MemberService', () => {
  describe('members', () => {
    it('excludes the org owner and paginates with defaults', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findUnique.mockResolvedValue({ ownerId: 1 });
      prisma.member.findMany.mockResolvedValue([]);
      prisma.member.count.mockResolvedValue(0);
      const service = new MemberService(prisma, makeMailer());

      await service.members({ orgId: 5 } as never);

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 5, isDeleted: false, userId: { not: 1 } },
          skip: 0,
          take: 15,
        }),
      );
    });

    it('adds a case-insensitive OR search across name/email fields', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findUnique.mockResolvedValue({ ownerId: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.members({ orgId: 5, search: 'jane' } as never);

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { firstName: { contains: 'jane', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('orders by email when sortBy is "email"', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findUnique.mockResolvedValue({ ownerId: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.members({ orgId: 5, sortBy: 'email' } as never);

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { email: 'asc' } }),
      );
    });

    it('orders by first/last name by default', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findUnique.mockResolvedValue({ ownerId: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.members({ orgId: 5 } as never);

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
      );
    });

    it('does not exclude anyone by ownerId when the org itself is not found', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findUnique.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await service.members({ orgId: 5 } as never);

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: 5, isDeleted: false } }),
      );
    });
  });

  describe('invites', () => {
    it('sweeps expired invites before listing', async () => {
      const prisma = createMockPrisma();
      const service = new MemberService(prisma, makeMailer());

      await service.invites(5);

      expect(prisma.memberInvite.updateMany).toHaveBeenCalled();
      expect(prisma.memberInvite.findMany).toHaveBeenCalledWith({
        where: { orgId: 5, isDeleted: false },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('invite', () => {
    it('throws ConflictException when a pending invite already exists for the email', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 }); // resolveActingMemberId
      prisma.memberInvite.findFirst.mockResolvedValue({ id: 1 });
      const service = new MemberService(prisma, makeMailer());

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('throws when the org is at capacity counting active members + pending invites', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(4);
      prisma.memberInvite.count.mockResolvedValue(1);
      prisma.organizationCapacity.findUnique.mockResolvedValue({
        members: 5,
      });
      const service = new MemberService(prisma, makeMailer());

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow('Member limit reached (5).');
    });

    it('sends the invite email and persists the invite with a token', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(0);
      prisma.memberInvite.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue({
        inviteExpiration: '1_day',
      });
      withOrgAndRole(prisma);
      prisma.memberInvite.create.mockResolvedValue({ id: 9 });
      const mailer = makeMailer();
      const service = new MemberService(prisma, mailer);

      await service.invite(
        5,
        { email: 'jane@x.com', roleId: 2, inviterName: 'Bob' } as never,
        1,
      );

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jane@x.com' }),
      );
      expect(prisma.memberInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 5,
            email: 'jane@x.com',
            roleId: 2,
            invitedBy: 1,
            token: expect.any(String),
          }),
        }),
      );
    });

    it('never creates the invite row when sending the email fails', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(0);
      prisma.memberInvite.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      withOrgAndRole(prisma);
      const mailer = makeMailer(
        jest.fn().mockRejectedValue(new Error('SendGrid down')),
      );
      const service = new MemberService(prisma, mailer);

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow(InternalServerErrorException);
      expect(prisma.memberInvite.create).not.toHaveBeenCalled();
    });

    it('still throws InternalServerErrorException when the send rejects with a non-Error value', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(0);
      prisma.memberInvite.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      withOrgAndRole(prisma);
      const mailer = makeMailer(
        jest.fn().mockRejectedValue('string rejection'),
      );
      const service = new MemberService(prisma, mailer);

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws NotFoundException when the target organization is missing', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(0);
      prisma.memberInvite.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 2, roleName: 'Member' });
      const service = new MemberService(prisma, makeMailer());

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the target role is missing', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.member.count.mockResolvedValue(0);
      prisma.memberInvite.count.mockResolvedValue(0);
      prisma.organizationCapacity.findUnique.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({
        organizationName: 'Acme',
        settings: {},
      });
      prisma.role.findUnique.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await expect(
        service.invite(5, { email: 'jane@x.com', roleId: 2 } as never, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resend', () => {
    it('throws NotFoundException for a missing invite', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await expect(service.resend(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws when the invite is not PENDING', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'ACCEPTED',
        expiry: null,
      });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      const service = new MemberService(prisma, makeMailer());

      await expect(service.resend(1, 1)).rejects.toThrow(
        'This invite is no longer pending.',
      );
    });

    it('flips a stale-pending, past-expiry invite to EXPIRED before rejecting the resend', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        expiry: new Date('2000-01-01'),
      });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      const service = new MemberService(prisma, makeMailer());

      await expect(service.resend(1, 1)).rejects.toThrow(BadRequestException);
      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'EXPIRED' },
      });
    });

    it('throws when still inside the resend cooldown', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        expiry: null,
        lastSentAt: new Date(),
        createdAt: new Date(),
      });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      const service = new MemberService(prisma, makeMailer());

      await expect(service.resend(1, 1)).rejects.toThrow(
        /Please wait \d+s before resending\./,
      );
    });

    it('resends, reusing the existing token and bumping resentCount', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        expiry: null,
        email: 'jane@x.com',
        roleId: 2,
        token: 'existing-token',
        lastSentAt: new Date(Date.now() - 10 * 60 * 1000),
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      withOrgAndRole(prisma);
      prisma.memberInvite.update.mockResolvedValue({ id: 1 });
      const mailer = makeMailer();
      const service = new MemberService(prisma, mailer);

      await service.resend(1, 1);

      expect(mailer.send).toHaveBeenCalled();
      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          resentCount: { increment: 1 },
          lastSentAt: expect.any(Date),
          expiry: expect.any(Date),
          token: 'existing-token',
          resentBy: 2,
        },
      });
    });

    it('generates a fresh token for a legacy invite that predates the token field', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 1,
        orgId: 5,
        status: 'PENDING',
        expiry: null,
        email: 'jane@x.com',
        roleId: 2,
        token: null,
        lastSentAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      withOrgAndRole(prisma);
      const service = new MemberService(prisma, makeMailer());

      await service.resend(1, 1);

      const [[data]] = prisma.memberInvite.update.mock.calls;
      expect(data.data.token).toEqual(expect.any(String));
      expect(data.data.token).not.toBeNull();
    });
  });

  describe('removeInvite', () => {
    it('throws NotFoundException for a missing invite', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await expect(service.removeInvite(1)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes and cancels an existing invite', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({ id: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.removeInvite(1);

      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, status: 'CANCELLED' },
      });
    });
  });

  describe('updateRole / updateActiveState', () => {
    it('throws NotFoundException for a missing member on updateRole', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await expect(
        service.updateRole(1, { roleId: 2 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the role for an existing member', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.updateRole(1, { roleId: 2 } as never);

      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { roleId: 2 },
        include: { role: true },
      });
    });

    it('updates the active state for an existing member', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1 });
      const service = new MemberService(prisma, makeMailer());

      await service.updateActiveState(1, { isActive: false } as never);

      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a missing member', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new MemberService(prisma, makeMailer());

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the member and deactivates the user when this was their last membership', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      prisma.member.count.mockResolvedValue(0);
      const service = new MemberService(prisma, makeMailer());

      await service.remove(1);

      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, userId: null },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { isDeleted: true, isActive: false },
      });
    });

    it('leaves the user account active when they still belong to other orgs', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      prisma.member.count.mockResolvedValue(1);
      const service = new MemberService(prisma, makeMailer());

      await service.remove(1);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('skips the user-deactivation check entirely for an already-userless member row', async () => {
      const prisma = createMockPrisma();
      prisma.member.findFirst.mockResolvedValue({ id: 1, userId: null });
      const service = new MemberService(prisma, makeMailer());

      await service.remove(1);

      expect(prisma.member.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
