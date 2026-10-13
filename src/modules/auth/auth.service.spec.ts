import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { JwtService } from '@nestjs/jwt';
import type { MailerService } from '../email/mailer.service';
import type { GoogleProfile } from './strategies/google.strategy';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeJwt() {
  return {
    sign: jest.fn().mockReturnValue('signed-jwt'),
  } as unknown as JwtService;
}

function makeMailer(
  sendImpl: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  return { send: sendImpl } as unknown as MailerService;
}

describe('AuthService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('signToken', () => {
    it('signs a JWT with the user id as sub', () => {
      const jwtService = makeJwt();
      const service = new AuthService(
        createMockPrisma(),
        jwtService,
        makeMailer(),
      );

      expect(service.signToken(7)).toBe('signed-jwt');
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 7 });
    });
  });

  describe('signup', () => {
    it('throws when password and confirmPassword do not match', async () => {
      const service = new AuthService(
        createMockPrisma(),
        makeJwt(),
        makeMailer(),
      );

      await expect(
        service.signup({ password: 'a', confirmPassword: 'b' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the (normalized) email already exists', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1 });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.signup({
          email: 'Jane@Example.com',
          password: 'a',
          confirmPassword: 'a',
          firstName: 'Jane',
          lastName: 'Doe',
        } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('sends the verification email before creating the user, normalizing the email', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      const mailer = makeMailer();
      const service = new AuthService(prisma, makeJwt(), mailer);

      await service.signup({
        email: '  Jane@Example.com  ',
        password: 'secret',
        confirmPassword: 'secret',
        firstName: '  Jane ',
        lastName: ' Doe ',
      } as never);

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jane@example.com' }),
      );
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          passwordHash: 'hashed',
          isVerified: false,
          hasOnboarded: false,
        }),
      });
    });

    it('never creates the user when the verification email fails to send', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      const mailer = makeMailer(
        jest.fn().mockRejectedValue(new Error('SMTP down')),
      );
      const service = new AuthService(prisma, makeJwt(), mailer);

      await expect(
        service.signup({
          email: 'jane@example.com',
          password: 'secret',
          confirmPassword: 'secret',
          firstName: 'Jane',
          lastName: 'Doe',
        } as never),
      ).rejects.toThrow(InternalServerErrorException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('still rejects with InternalServerErrorException when the send rejects with a non-Error value', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      const mailer = makeMailer(
        jest.fn().mockRejectedValue('string rejection'),
      );
      const service = new AuthService(prisma, makeJwt(), mailer);

      await expect(
        service.signup({
          email: 'jane@example.com',
          password: 'secret',
          confirmPassword: 'secret',
          firstName: 'Jane',
          lastName: 'Doe',
        } as never),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when no user matches', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'a' } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a Google-only account (no passwordHash)', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: null });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'a' } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'wrong' } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a deactivated account', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: 'h',
        isActive: false,
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'a' } as never),
      ).rejects.toThrow('This account has been deactivated.');
    });

    it('throws ForbiddenException with code UNVERIFIED for an unverified account', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: 'h',
        isActive: true,
        isVerified: false,
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'a' } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the user id for valid, active, verified credentials', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 7,
        passwordHash: 'h',
        isActive: true,
        isVerified: true,
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.login({ email: 'x@y.com', password: 'a' } as never),
      ).resolves.toBe(7);
    });
  });

  describe('findValidInviteByToken (via getInviteInfo)', () => {
    it('throws BadRequestException for an unknown token', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.getInviteInfo('bad')).rejects.toThrow(
        'Invalid or already-used invite link.',
      );
    });

    it('throws BadRequestException when the invite is not PENDING', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.getInviteInfo('t')).rejects.toThrow(
        'This invite is no longer pending.',
      );
    });

    it('throws BadRequestException when the invite has expired', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        status: 'PENDING',
        expiry: new Date('2000-01-01'),
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.getInviteInfo('t')).rejects.toThrow(
        'This invite has expired.',
      );
    });
  });

  describe('getInviteInfo', () => {
    function pendingInvite(overrides: Record<string, unknown> = {}) {
      return {
        status: 'PENDING',
        expiry: null,
        email: 'jane@example.com',
        organization: { organizationName: 'Acme' },
        role: { roleName: 'Member' },
        ...overrides,
      };
    }

    it('requires a password for a brand-new, non-Gmail invitee', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const result = await service.getInviteInfo('t');
      expect(result.requiresPassword).toBe(true);
    });

    it('does not require a password when the invitee already has an account', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({ id: 1 });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const result = await service.getInviteInfo('t');
      expect(result.requiresPassword).toBe(false);
    });

    it('does not require a password for a Gmail address, even with no account yet', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(
        pendingInvite({ email: 'jane@gmail.com' }),
      );
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const result = await service.getInviteInfo('t');
      expect(result.requiresPassword).toBe(false);
    });
  });

  describe('acceptInvite', () => {
    function pendingInvite(overrides: Record<string, unknown> = {}) {
      return {
        id: 9,
        orgId: 5,
        roleId: 2,
        status: 'PENDING',
        expiry: null,
        email: 'jane@example.com',
        organization: {
          organizationName: 'Acme',
          owner: { email: 'owner@example.com' },
        },
        role: { roleName: 'Member' },
        invitedByMember: { email: 'inviter@example.com' },
        resentByMember: null,
        ...overrides,
      };
    }

    it('throws BadRequestException when a brand-new non-Gmail invitee omits required fields', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.acceptInvite({ token: 't' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new account with a hashed password, verified and onboarded', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      prisma.user.create.mockResolvedValue({
        id: 1,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        isActive: true,
      });
      prisma.member.findFirst.mockResolvedValue(null); // alreadyMember check
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const userId = await service.acceptInvite({
        token: 't',
        firstName: 'Jane',
        lastName: 'Doe',
        password: 'secret',
      } as never);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'jane@example.com',
          passwordHash: 'hashed',
          isVerified: true,
          hasOnboarded: true,
          createdViaInvite: true,
        }),
      });
      expect(userId).toBe(1);
    });

    it('creates a passwordless account for a Gmail invitee, defaulting the name', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(
        pendingInvite({ email: 'jane@gmail.com' }),
      );
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 1,
        firstName: 'jane',
        lastName: '',
        email: 'jane@gmail.com',
        isActive: true,
      });
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.acceptInvite({ token: 't' } as never);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          passwordHash: null,
          firstName: 'jane',
          lastName: '',
        }),
      });
    });

    it('falls back to "Member" when the Gmail address has no local part to default from', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(
        pendingInvite({ email: '@gmail.com' }),
      );
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 1,
        firstName: 'Member',
        lastName: '',
        email: '@gmail.com',
        isActive: true,
      });
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.acceptInvite({ token: 't' } as never);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firstName: 'Member' }),
      });
    });

    it('throws UnauthorizedException for a deactivated existing account', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({ id: 1, isActive: false });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(
        service.acceptInvite({ token: 't' } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revives an existing (e.g. previously-removed) member row for this org/email', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
      prisma.member.findFirst
        .mockResolvedValueOnce(null) // alreadyMember check (checked first)
        .mockResolvedValueOnce({ id: 50 }); // existingMember in acceptInviteForNewUser
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.acceptInvite({ token: 't' } as never);

      expect(prisma.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({ userId: 1, isDeleted: false }),
        }),
      );
    });

    it('creates a brand new member row when none exists to revive', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
      prisma.member.findFirst
        .mockResolvedValueOnce(null) // alreadyMember check
        .mockResolvedValueOnce(null); // existingMember in acceptInviteForNewUser
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.acceptInvite({ token: 't' } as never);

      expect(prisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: 5 }),
        }),
      );
    });

    it('just closes out the invite (no new member row) when already a member', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
      prisma.member.findFirst.mockResolvedValueOnce({ id: 1 }); // alreadyMember: true
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.acceptInvite({ token: 't' } as never);

      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { status: 'ACCEPTED' },
      });
      expect(prisma.member.create).not.toHaveBeenCalled();
    });

    it('notifies owner/inviter/reinviter, deduped by email, swallowing a send failure', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(
        pendingInvite({
          resentByMember: { email: 'inviter@example.com' }, // same as invitedByMember -> dedup
        }),
      );
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
      prisma.member.findFirst.mockResolvedValueOnce({ id: 1 });
      const send = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('SMTP down'));
      const service = new AuthService(prisma, makeJwt(), makeMailer(send));

      await expect(service.acceptInvite({ token: 't' } as never)).resolves.toBe(
        1,
      );
      // owner@example.com + inviter@example.com (deduped against resentByMember)
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('swallows a notify-send failure that rejects with a non-Error value too', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue(pendingInvite());
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
      prisma.member.findFirst.mockResolvedValueOnce({ id: 1 });
      const send = jest.fn().mockRejectedValue('string rejection');
      const service = new AuthService(prisma, makeJwt(), makeMailer(send));

      await expect(service.acceptInvite({ token: 't' } as never)).resolves.toBe(
        1,
      );
    });
  });

  describe('declineInvite', () => {
    it('marks the invite REJECTED and notifies, without creating any account', async () => {
      const prisma = createMockPrisma();
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 9,
        status: 'PENDING',
        expiry: null,
        email: 'jane@example.com',
        organization: {
          organizationName: 'Acme',
          owner: { email: 'owner@example.com' },
        },
        role: { roleName: 'Member' },
        invitedByMember: { email: 'inviter@example.com' },
        resentByMember: null,
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.declineInvite({ token: 't' } as never);

      expect(prisma.memberInvite.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { status: 'REJECTED' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateFromGoogle', () => {
    function profile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
      return {
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: 'https://x/a.png',
        ...overrides,
      };
    }

    it('returns the existing user when found by googleId', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isActive: true,
        isVerified: true,
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const result = await service.findOrCreateFromGoogle(profile());
      expect(result).toEqual({ userId: 1, needsVerification: false });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('links Google onto an existing password account found by email', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst
        .mockResolvedValueOnce(null) // by googleId
        .mockResolvedValueOnce({ id: 1, avatar: null }); // by email
      prisma.user.update.mockResolvedValue({
        id: 1,
        isActive: true,
        isVerified: true,
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.findOrCreateFromGoogle(profile());

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { googleId: 'g1', avatar: 'https://x/a.png' },
      });
    });

    it('keeps the existing avatar when linking, rather than overwriting it', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, avatar: 'https://x/existing.png' });
      prisma.user.update.mockResolvedValue({
        id: 1,
        isActive: true,
        isVerified: true,
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.findOrCreateFromGoogle(profile());

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { googleId: 'g1', avatar: 'https://x/existing.png' },
      });
    });

    it('accepts a pending membership invite for a brand-new Google sign-in', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst
        .mockResolvedValueOnce(null) // by googleId
        .mockResolvedValueOnce(null); // by email
      prisma.memberInvite.findFirst.mockResolvedValue({
        id: 9,
        orgId: 5,
        roleId: 2,
      });
      prisma.user.create.mockResolvedValue({
        id: 1,
        isActive: true,
        isVerified: true,
      });
      prisma.member.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      const result = await service.findOrCreateFromGoogle(profile());

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isVerified: true,
            hasOnboarded: true,
            createdViaInvite: true,
          }),
        }),
      );
      expect(result.needsVerification).toBe(false);
    });

    it('sends a verification email and creates an unverified account with no pending invite', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.memberInvite.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 1,
        isActive: true,
        isVerified: false,
      });
      const mailer = makeMailer();
      const service = new AuthService(prisma, makeJwt(), mailer);

      const result = await service.findOrCreateFromGoogle(profile());

      expect(mailer.send).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isVerified: false }),
        }),
      );
      expect(result.needsVerification).toBe(true);
    });

    it('throws UnauthorizedException for a deactivated account', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, isActive: false });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.findOrCreateFromGoogle(profile())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resendVerification', () => {
    it('throws BadRequestException when no account matches', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.resendVerification('x@y.com')).rejects.toThrow(
        'No account found for this email.',
      );
    });

    it('throws BadRequestException when already verified', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, isVerified: true });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.resendVerification('x@y.com')).rejects.toThrow(
        'This account is already verified.',
      );
    });

    it('throws BadRequestException when still inside the cooldown', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        isVerified: false,
        lastVerificationSentAt: new Date(),
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.resendVerification('x@y.com')).rejects.toThrow(
        /Please wait \d+s before resending\./,
      );
    });

    it('sends and persists a fresh token when never sent before', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'x@y.com',
        firstName: 'Jane',
        isVerified: false,
        lastVerificationSentAt: null,
      });
      const mailer = makeMailer();
      const service = new AuthService(prisma, makeJwt(), mailer);

      await service.resendVerification('x@y.com');

      expect(mailer.send).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            verificationToken: expect.any(String),
          }),
        }),
      );
    });

    it('sends again once the cooldown has elapsed', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'x@y.com',
        firstName: 'Jane',
        isVerified: false,
        lastVerificationSentAt: new Date(Date.now() - 10 * 60 * 1000),
      });
      const mailer = makeMailer();
      const service = new AuthService(prisma, makeJwt(), mailer);

      await service.resendVerification('x@y.com');
      expect(mailer.send).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('throws BadRequestException for an unknown token', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.verifyEmail('bad')).rejects.toThrow(
        'Invalid or already-used verification link.',
      );
    });

    it('throws BadRequestException for an expired token', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        verificationTokenExpiry: new Date('2000-01-01'),
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.verifyEmail('t')).rejects.toThrow(
        'This verification link has expired.',
      );
    });

    it('verifies and clears the token, returning the user id', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 7,
        verificationTokenExpiry: null,
      });
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await expect(service.verifyEmail('t')).resolves.toBe(7);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          isVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
        },
      });
    });
  });

  describe('completeOnboarding', () => {
    it('marks the user as onboarded', async () => {
      const prisma = createMockPrisma();
      const service = new AuthService(prisma, makeJwt(), makeMailer());

      await service.completeOnboarding(7);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { hasOnboarded: true },
      });
    });
  });
});
