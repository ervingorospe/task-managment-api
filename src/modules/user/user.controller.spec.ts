import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';
import type { UserService } from './user.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const SELF: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    update: jest.fn(),
    changePassword: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    uploadAvatar: jest.fn(),
  } as unknown as UserService;
}

describe('UserController', () => {
  describe('update', () => {
    it('throws ForbiddenException when editing someone else', () => {
      const service = makeService();
      const controller = new UserController(service);

      expect(() => controller.update(99, {} as never, SELF)).toThrow(
        ForbiddenException,
      );
      expect(service.update).not.toHaveBeenCalled();
    });

    it("delegates to the service for one's own account", () => {
      const service = makeService();
      const controller = new UserController(service);
      const dto = { firstName: 'Jane' } as never;

      void controller.update(7, dto, SELF);
      expect(service.update).toHaveBeenCalledWith(7, dto);
    });
  });

  describe('changePassword', () => {
    it('throws ForbiddenException for another user', async () => {
      const service = makeService();
      const controller = new UserController(service);

      await expect(
        controller.changePassword(99, {} as never, SELF),
      ).rejects.toThrow(ForbiddenException);
    });

    it('delegates and returns a confirmation message', async () => {
      const service = makeService();
      const controller = new UserController(service);
      const dto = { newPassword: 'a', confirmPassword: 'a' } as never;

      const result = await controller.changePassword(7, dto, SELF);

      expect(service.changePassword).toHaveBeenCalledWith(7, dto);
      expect(result).toEqual({ message: 'Password updated.' });
    });
  });

  describe('deleteAccount', () => {
    it('throws ForbiddenException for another user', async () => {
      const service = makeService();
      const controller = new UserController(service);

      await expect(controller.deleteAccount(99, SELF)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('delegates and returns a confirmation message', async () => {
      const service = makeService();
      const controller = new UserController(service);

      const result = await controller.deleteAccount(7, SELF);

      expect(service.deleteAccount).toHaveBeenCalledWith(7);
      expect(result).toEqual({ message: 'Account deleted.' });
    });
  });

  describe('uploadAvatar', () => {
    it('throws ForbiddenException for another user', () => {
      const service = makeService();
      const controller = new UserController(service);

      expect(() =>
        controller.uploadAvatar(99, {} as Express.Multer.File, SELF),
      ).toThrow(ForbiddenException);
    });

    it("delegates to the service for one's own avatar", () => {
      const service = makeService();
      const controller = new UserController(service);
      const file = {} as Express.Multer.File;

      void controller.uploadAvatar(7, file, SELF);
      expect(service.uploadAvatar).toHaveBeenCalledWith(7, file);
    });
  });
});
