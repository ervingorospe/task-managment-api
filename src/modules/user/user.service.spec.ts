import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { createMockPrisma } from '../../test/mock-prisma';
import type { S3Service } from '../storage/s3.service';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeS3() {
  return { upload: jest.fn() } as unknown as S3Service;
}

describe('UserService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('findByIdWithMemberships', () => {
    it('strips passwordHash and adds hasPassword: true when one is set', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: 'hash',
      });
      const service = new UserService(prisma, makeS3());

      const result = await service.findByIdWithMemberships(1);

      expect(result).toEqual({ id: 1, hasPassword: true });
    });

    it('reports hasPassword: false for a Google-only account', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: null });
      const service = new UserService(prisma, makeS3());

      const result = await service.findByIdWithMemberships(1);
      expect(result.hasPassword).toBe(false);
    });

    it('throws NotFoundException for a missing/deleted user', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new UserService(prisma, makeS3());

      await expect(service.findByIdWithMemberships(1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws when the user does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new UserService(prisma, makeS3());

      await expect(
        service.update(1, { firstName: 'Jane' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates and returns the user with hasPassword computed', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1 });
      prisma.user.update.mockResolvedValue({
        id: 1,
        firstName: 'Jane',
        passwordHash: 'hash',
      });
      const service = new UserService(prisma, makeS3());

      const result = await service.update(1, { firstName: 'Jane' } as never);
      expect(result).toEqual({ id: 1, firstName: 'Jane', hasPassword: true });
    });
  });

  describe('uploadAvatar', () => {
    it('throws when the user does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new UserService(prisma, makeS3());

      await expect(
        service.uploadAvatar(1, {} as Express.Multer.File),
      ).rejects.toThrow(NotFoundException);
    });

    it('uploads to the "profile" folder once the user is confirmed to exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1 });
      const s3 = makeS3();
      (s3.upload as jest.Mock).mockResolvedValue({
        key: 'k',
        url: 'https://x/k',
      });
      const service = new UserService(prisma, s3);

      const file = {} as Express.Multer.File;
      await service.uploadAvatar(1, file);

      expect(s3.upload).toHaveBeenCalledWith(file, 'profile');
    });
  });

  describe('changePassword', () => {
    it('throws when newPassword and confirmPassword do not match', async () => {
      const prisma = createMockPrisma();
      const service = new UserService(prisma, makeS3());

      await expect(
        service.changePassword(1, {
          newPassword: 'a',
          confirmPassword: 'b',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the user does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new UserService(prisma, makeS3());

      await expect(
        service.changePassword(1, {
          newPassword: 'a',
          confirmPassword: 'a',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('requires currentPassword when the account already has one', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: 'h' });
      const service = new UserService(prisma, makeS3());

      await expect(
        service.changePassword(1, {
          newPassword: 'a',
          confirmPassword: 'a',
        } as never),
      ).rejects.toThrow('Enter your current password.');
    });

    it('throws UnauthorizedException when currentPassword does not match', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const service = new UserService(prisma, makeS3());

      await expect(
        service.changePassword(1, {
          currentPassword: 'wrong',
          newPassword: 'a',
          confirmPassword: 'a',
        } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes and saves the new password when currentPassword matches', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockedBcrypt.hash.mockResolvedValue('new-hash' as never);
      const service = new UserService(prisma, makeS3());

      await service.changePassword(1, {
        currentPassword: 'correct',
        newPassword: 'newpass',
        confirmPassword: 'newpass',
      } as never);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: 'new-hash' },
      });
    });

    it('skips the currentPassword check for a Google-only account (no existing hash)', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: null });
      mockedBcrypt.hash.mockResolvedValue('new-hash' as never);
      const service = new UserService(prisma, makeS3());

      await service.changePassword(1, {
        newPassword: 'newpass',
        confirmPassword: 'newpass',
      } as never);

      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: 'new-hash' },
      });
    });
  });

  describe('deleteAccount', () => {
    it('throws when the user does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = new UserService(prisma, makeS3());

      await expect(service.deleteAccount(1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for an invite-created account', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        createdViaInvite: true,
      });
      const service = new UserService(prisma, makeS3());

      await expect(service.deleteAccount(1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('soft-deletes and deactivates an account that signed up on its own', async () => {
      const prisma = createMockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        createdViaInvite: false,
      });
      const service = new UserService(prisma, makeS3());

      await service.deleteAccount(1);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, isActive: false },
      });
    });
  });
});
