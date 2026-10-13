import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { S3Service } from '../storage/s3.service';
import type { MailerService } from '../email/mailer.service';

function makeS3() {
  return { upload: jest.fn(), delete: jest.fn() } as unknown as S3Service;
}

function makeMailer(
  sendImpl: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  return { send: sendImpl } as unknown as MailerService;
}

const OWNER = {
  id: 1,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

describe('OrganizationService', () => {
  describe('create', () => {
    it('throws BadRequestException when the owner does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create({ organizationName: 'Acme' } as never, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the owner already has an org with this name', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue({ id: 99 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create({ organizationName: 'Acme' } as never, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('logs and rethrows when the creation transaction fails', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('tx failed'),
      );
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create(
          {
            organizationName: 'Acme',
            roles: [],
            tags: [],
            invites: [],
          } as never,
          1,
        ),
      ).rejects.toThrow('tx failed');
    });

    it('logs without a stack trace when the transaction rejects with a non-Error value', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue('string rejection');
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create(
          {
            organizationName: 'Acme',
            roles: [],
            tags: [],
            invites: [],
          } as never,
          1,
        ),
      ).rejects.toBe('string rejection');
    });

    it('throws BadRequestException when no Superadmin role is included', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null); // slug is free
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 10 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create(
          {
            organizationName: 'Acme',
            roles: [{ roleName: 'Member', rules: [] }],
            tags: [],
            invites: [],
          } as never,
          1,
        ),
      ).rejects.toThrow('roles must include a Superadmin role.');
    });

    it('creates the full org graph and returns the composed details', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockImplementation(({ data }: never) =>
        Promise.resolve({ id: data.roleName === 'Superadmin' ? 100 : 101 }),
      );
      prisma.member.create.mockResolvedValue({ id: 50 });

      const service = new OrganizationService(prisma, makeS3(), makeMailer());
      const detailsSpy = jest
        .spyOn(service, 'getDetailsBySlug')
        .mockResolvedValue({ id: 5 } as never);

      const result = await service.create(
        {
          organizationName: 'Acme',
          roles: [
            { id: 1, roleName: 'Superadmin', rules: [{ id: 1 }] },
            { id: 2, roleName: 'Member', rules: [] },
          ],
          tags: [{ tagName: 'Bug', color: '#f00', isDefault: true }],
          invites: [{ email: 'bob@x.com', roleId: 2 }],
        } as never,
        1,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { hasOnboarded: true },
      });
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tagName: 'Bug' }),
        }),
      );
      expect(prisma.memberInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'bob@x.com',
            roleId: 101,
            invitedBy: 50,
          }),
        }),
      );
      expect(detailsSpy).toHaveBeenCalled();
      expect(result).toEqual({ id: 5 });
    });

    it('throws BadRequestException when an invite references a roleId not in roles[]', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 100 });
      prisma.member.create.mockResolvedValue({ id: 50 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.create(
          {
            organizationName: 'Acme',
            roles: [{ id: 1, roleName: 'Superadmin', rules: [] }],
            tags: [],
            invites: [{ email: 'bob@x.com', roleId: 999 }],
          } as never,
          1,
        ),
      ).rejects.toThrow(/does not match any role/);
    });

    it('skips (but does not fail) an invite whose email fails to send', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 100 });
      prisma.member.create.mockResolvedValue({ id: 50 });
      const mailer = makeMailer(
        jest.fn().mockRejectedValue(new Error('SendGrid down')),
      );
      const service = new OrganizationService(prisma, makeS3(), mailer);
      jest.spyOn(service, 'getDetailsBySlug').mockResolvedValue({} as never);

      await service.create(
        {
          organizationName: 'Acme',
          roles: [{ id: 1, roleName: 'Superadmin', rules: [] }],
          tags: [],
          invites: [{ email: 'bob@x.com', roleId: 1 }],
        } as never,
        1,
      );

      expect(prisma.memberInvite.create).not.toHaveBeenCalled();
    });

    it('skips (but does not fail) an invite whose email send rejects with a non-Error value', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 100 });
      prisma.member.create.mockResolvedValue({ id: 50 });
      const mailer = makeMailer(
        jest.fn().mockRejectedValue('string rejection'),
      );
      const service = new OrganizationService(prisma, makeS3(), mailer);
      jest.spyOn(service, 'getDetailsBySlug').mockResolvedValue({} as never);

      await service.create(
        {
          organizationName: 'Acme',
          roles: [{ id: 1, roleName: 'Superadmin', rules: [] }],
          tags: [],
          invites: [{ email: 'bob@x.com', roleId: 1 }],
        } as never,
        1,
      );

      expect(prisma.memberInvite.create).not.toHaveBeenCalled();
    });

    it('falls back to "A team member" as the inviter name when the owner has none', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        firstName: '',
        lastName: '',
        email: 'jane@example.com',
      });
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 100 });
      prisma.member.create.mockResolvedValue({ id: 50 });
      const send = jest.fn().mockResolvedValue(undefined);
      const service = new OrganizationService(
        prisma,
        makeS3(),
        makeMailer(send),
      );
      jest.spyOn(service, 'getDetailsBySlug').mockResolvedValue({} as never);

      await service.create(
        {
          organizationName: 'Acme',
          roles: [{ id: 1, roleName: 'Superadmin', rules: [] }],
          tags: [],
          invites: [{ email: 'bob@x.com', roleId: 1 }],
        } as never,
        1,
      );

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('A team member'),
        }),
      );
    });

    it('generates a unique slug by appending a numeric suffix on collision', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(OWNER);
      prisma.organization.findFirst.mockResolvedValue(null);
      prisma.organizationSettings.findUnique
        .mockResolvedValueOnce({ id: 1 }) // "acme" taken
        .mockResolvedValueOnce(null); // "acme-2" free
      prisma.organization.create.mockResolvedValue({
        id: 5,
        organizationName: 'Acme',
      });
      prisma.role.create.mockResolvedValue({ id: 100 });
      prisma.member.create.mockResolvedValue({ id: 50 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());
      const detailsSpy = jest
        .spyOn(service, 'getDetailsBySlug')
        .mockResolvedValue({} as never);

      await service.create(
        {
          organizationName: 'Acme',
          roles: [{ id: 1, roleName: 'Superadmin', rules: [] }],
          tags: [],
          invites: [],
        } as never,
        1,
      );

      expect(detailsSpy).toHaveBeenCalledWith('acme-2', expect.anything());
    });
  });

  describe('myOwnOrganizations', () => {
    it('maps each org to its id/name/desc/slug', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findMany.mockResolvedValue([
        {
          id: 1,
          organizationName: 'Acme',
          organizationDesc: 'desc',
          settings: { slug: 'acme' },
        },
      ]);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await service.myOwnOrganizations(1);

      expect(result).toEqual([
        {
          id: 1,
          organizationName: 'Acme',
          organizationDesc: 'desc',
          slug: 'acme',
        },
      ]);
    });
  });

  describe('getDetailsBySlug / getDetailsById / getDetailsWhere', () => {
    function baseOrg(overrides: Record<string, unknown> = {}) {
      return {
        id: 5,
        ownerId: 1,
        organizationName: 'Acme',
        organizationDesc: null,
        email: null,
        website: null,
        settings: {},
        capacity: {},
        owner: { id: 1 },
        roles: [],
        tags: [],
        members: [
          { id: 1, userId: 1 }, // the owner, filtered out below
          { id: 2, userId: 2 },
        ],
        invites: [],
        ...overrides,
      };
    }

    it('throws NotFoundException when no org matches', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(service.getDetailsById(5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('filters the owner out of the members list', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(baseOrg());
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await service.getDetailsById(5);

      expect(result.members).toEqual([{ id: 2, userId: 2 }]);
    });

    it('lazily expires a past-due PENDING invite and persists the flip', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(
        baseOrg({
          invites: [
            {
              id: 9,
              status: 'PENDING',
              expiry: new Date('2000-01-01'),
              type: 'MEMBERSHIP',
            },
          ],
        }),
      );
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await service.getDetailsById(5);

      expect(prisma.memberInvite.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [9] } },
        data: { status: 'EXPIRED' },
      });
      expect(result.pendingInvites[0].status).toBe('EXPIRED');
    });

    it('does not touch the DB when nothing needs expiring', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(
        baseOrg({
          invites: [
            {
              id: 9,
              status: 'PENDING',
              expiry: new Date('2999-01-01'),
              type: 'MEMBERSHIP',
            },
          ],
        }),
      );
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.getDetailsById(5);

      expect(prisma.memberInvite.updateMany).not.toHaveBeenCalled();
    });

    it('surfaces a pending OWNERSHIP invite as pendingOwnershipTransfer', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(
        baseOrg({
          invites: [
            { id: 1, status: 'PENDING', expiry: null, type: 'OWNERSHIP' },
            { id: 2, status: 'PENDING', expiry: null, type: 'MEMBERSHIP' },
          ],
        }),
      );
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await service.getDetailsById(5);

      expect(result.pendingOwnershipTransfer).toEqual(
        expect.objectContaining({ id: 1, type: 'OWNERSHIP' }),
      );
      expect(result.pendingInvites).toEqual([
        expect.objectContaining({ id: 2 }),
      ]);
    });

    it('reports pendingOwnershipTransfer as null when there is none', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(baseOrg());
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await service.getDetailsById(5);
      expect(result.pendingOwnershipTransfer).toBeNull();
    });

    it('getDetailsBySlug resolves an org by its settings slug', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(baseOrg());
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.getDetailsBySlug('acme');

      expect(prisma.organization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { settings: { slug: 'acme' }, isDeleted: false },
        }),
      );
    });

    it('getDetailsWhere defaults to the main PrismaService when called without a tx', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(baseOrg());
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      const result = await (
        service as unknown as {
          getDetailsWhere: (
            where: Record<string, unknown>,
          ) => Promise<{ id: number }>;
        }
      ).getDetailsWhere({ id: 5 });

      expect(result.id).toBe(5);
    });
  });

  describe('updateBasicInfo', () => {
    it('throws NotFoundException for an inactive/missing org', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(service.updateBasicInfo(5, {} as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when renaming clashes with another org the same owner has', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst
        .mockResolvedValueOnce({
          id: 5,
          ownerId: 1,
          organizationName: 'Old',
        })
        .mockResolvedValueOnce({ id: 99 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.updateBasicInfo(5, { organizationName: 'New' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('updates when the name is unchanged', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValueOnce({
        id: 5,
        ownerId: 1,
        organizationName: 'Acme',
      });
      prisma.organization.update.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateBasicInfo(5, { organizationName: 'Acme' } as never);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { organizationName: 'Acme' },
      });
    });

    it('updates when the name changes but no other org of the owner clashes', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst
        .mockResolvedValueOnce({
          id: 5,
          ownerId: 1,
          organizationName: 'Old',
        })
        .mockResolvedValueOnce(null);
      prisma.organization.update.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateBasicInfo(5, { organizationName: 'New' } as never);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { organizationName: 'New' },
      });
    });
  });

  describe('uploadLogo', () => {
    it('throws NotFoundException for a missing org', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.uploadLogo(5, {} as Express.Multer.File),
      ).rejects.toThrow(NotFoundException);
    });

    it('uploads and persists the logo url on org settings', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      const s3 = makeS3();
      (s3.upload as jest.Mock).mockResolvedValue({
        key: 'k',
        url: 'https://x/k',
      });
      const service = new OrganizationService(prisma, s3, makeMailer());

      const result = await service.uploadLogo(5, {} as Express.Multer.File);

      expect(prisma.organizationSettings.update).toHaveBeenCalledWith({
        where: { orgId: 5 },
        data: { logo: 'https://x/k' },
      });
      expect(result).toEqual({ key: 'k', url: 'https://x/k' });
    });
  });

  describe('updateTimezone / updateInviteExpiration / updateNotifications / updateActiveState', () => {
    it('updates the timezone', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateTimezone(5, { timezone: 'UTC' } as never);

      expect(prisma.organizationSettings.update).toHaveBeenCalledWith({
        where: { orgId: 5 },
        data: { timezone: 'UTC' },
      });
    });

    it('updates the invite expiration', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateInviteExpiration(5, {
        inviteExpiration: '1_week',
      } as never);

      expect(prisma.organizationSettings.update).toHaveBeenCalledWith({
        where: { orgId: 5 },
        data: { inviteExpiration: '1_week' },
      });
    });

    it('updates the notification preference', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateNotifications(5, { sendEmailNotif: false } as never);

      expect(prisma.organizationSettings.update).toHaveBeenCalledWith({
        where: { orgId: 5 },
        data: { sendEmailNotif: false },
      });
    });

    it('updates the active state', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.updateActiveState(5, { isActive: false } as never);

      expect(prisma.organizationSettings.update).toHaveBeenCalledWith({
        where: { orgId: 5 },
        data: { isActive: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a missing org', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(service.remove(5)).rejects.toThrow(NotFoundException);
    });

    it('deletes users left with no other org ties, and spares those who still have one', async () => {
      const prisma = createMockPrisma();
      prisma.member.findMany.mockResolvedValue([{ userId: 2 }, { userId: 3 }]);
      // candidateUserIds iterates in Set insertion order: members first
      // (2, 3), then the owner (1) added last via .add().
      // userId 1 (owner) and 2: no ties elsewhere -> deleted.
      // userId 3: still owns another org -> spared.
      prisma.organization.findFirst
        .mockResolvedValueOnce({ id: 5, ownerId: 1 }) // findActiveOrThrow
        .mockResolvedValueOnce(null) // user 2: ownsElsewhere
        .mockResolvedValueOnce({ id: 1 }) // user 3: ownsElsewhere -> spared
        .mockResolvedValueOnce(null); // user 1: ownsElsewhere
      prisma.member.findFirst.mockResolvedValue(null); // nobody is a member elsewhere
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.remove(5);

      expect(prisma.organization.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
      const deletedIds = prisma.user.delete.mock.calls.map(
        ([arg]: [{ where: { id: number } }]) => arg.where.id,
      );
      expect(deletedIds.sort()).toEqual([1, 2]);
      expect(deletedIds).not.toContain(3);
    });
  });

  describe('requestOwnershipTransfer', () => {
    it('throws NotFoundException for a missing/inactive org', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.requestOwnershipTransfer(5, {} as never, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when a transfer is already pending', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      prisma.memberInvite.findFirst.mockResolvedValue({ id: 1 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.requestOwnershipTransfer(5, {} as never, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the org has no Superadmin role', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.role.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(
        service.requestOwnershipTransfer(5, { email: 'x@y.com' } as never, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a pending OWNERSHIP invite', async () => {
      const prisma = createMockPrisma();
      prisma.organization.findFirst.mockResolvedValue({ id: 5 });
      prisma.member.findFirst.mockResolvedValue({ id: 2 });
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.role.findFirst.mockResolvedValue({ id: 100 });
      prisma.memberInvite.create.mockResolvedValue({ id: 9 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.requestOwnershipTransfer(
        5,
        { email: 'x@y.com' } as never,
        1,
      );

      expect(prisma.memberInvite.create).toHaveBeenCalledWith({
        data: {
          orgId: 5,
          roleId: 100,
          email: 'x@y.com',
          type: 'OWNERSHIP',
          invitedBy: 2,
        },
      });
    });
  });

  describe('cancelOwnershipTransfer', () => {
    it('throws NotFoundException when nothing is pending', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await expect(service.cancelOwnershipTransfer(5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cancels and soft-deletes the pending transfer invite', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({ id: 9 });
      const service = new OrganizationService(prisma, makeS3(), makeMailer());

      await service.cancelOwnershipTransfer(5);

      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { status: 'CANCELLED', isDeleted: true },
      });
    });
  });

  describe('defaults', () => {
    it('lists default (global) roles', async () => {
      const prisma = createMockPrisma();
      const service = new OrganizationService(prisma, makeS3(), makeMailer());
      await service.defaultRoles();
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: null, isDeleted: false } }),
      );
    });

    it('lists default (global) tags', async () => {
      const prisma = createMockPrisma();
      const service = new OrganizationService(prisma, makeS3(), makeMailer());
      await service.defaultTags();
      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { orgId: null, isDeleted: false },
      });
    });

    it('lists every rule category with its rules', async () => {
      const prisma = createMockPrisma();
      const service = new OrganizationService(prisma, makeS3(), makeMailer());
      await service.defaultPermissions();
      expect(prisma.ruleCategory.findMany).toHaveBeenCalledWith({
        include: { rules: true },
      });
    });
  });
});
