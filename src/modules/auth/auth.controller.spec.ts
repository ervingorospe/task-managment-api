import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { UserService } from '../user/user.service';
import { AUTH_COOKIE_NAME } from './auth.constants';
import type { RequestUser } from '../../common/guards/permissions.guard';
import type { GoogleProfile } from './strategies/google.strategy';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeAuthService() {
  return {
    signup: jest.fn().mockResolvedValue(undefined),
    login: jest.fn(),
    signToken: jest.fn().mockReturnValue('signed-jwt'),
    findOrCreateFromGoogle: jest.fn(),
    resendVerification: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn(),
    getInviteInfo: jest.fn(),
    acceptInvite: jest.fn(),
    declineInvite: jest.fn().mockResolvedValue(undefined),
    completeOnboarding: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
}

function makeUserService() {
  return {
    findByIdWithMemberships: jest.fn(),
  } as unknown as UserService;
}

function makeResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

describe('AuthController', () => {
  describe('signup', () => {
    it('delegates and returns a confirmation message', async () => {
      const authService = makeAuthService();
      const controller = new AuthController(authService, makeUserService());
      const dto = { email: 'x@y.com' } as never;

      const result = await controller.signup(dto);

      expect(authService.signup).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        message: 'Check your email to verify your account.',
      });
    });
  });

  describe('login', () => {
    it('sets the auth cookie and returns the user with memberships', async () => {
      const authService = makeAuthService();
      (authService.login as jest.Mock).mockResolvedValue(7);
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        id: 7,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();
      const dto = { email: 'x@y.com', password: 'a' } as never;

      const result = await controller.login(dto, res);

      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        'signed-jwt',
        expect.anything(),
      );
      expect(result).toEqual({ id: 7 });
    });
  });

  describe('googleLogin', () => {
    it('is a no-op — passport handles the redirect to Google', () => {
      const controller = new AuthController(
        makeAuthService(),
        makeUserService(),
      );
      expect(controller.googleLogin()).toBeUndefined();
    });
  });

  describe('googleCallback', () => {
    function makeReq(
      profile: GoogleProfile,
    ): Request & { user: GoogleProfile } {
      return { user: profile } as never;
    }

    it('redirects to verify-pending with the email when verification is still needed', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockResolvedValue({
        userId: 1,
        needsVerification: true,
      });
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/verify-pending?email=jane%40example.com'),
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('sets the cookie and redirects to /onboarding for a first-time user', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockResolvedValue({
        userId: 1,
        needsVerification: false,
      });
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        hasOnboarded: false,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.cookie).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/onboarding'),
      );
    });

    it('redirects to /dashboard for an already-onboarded user', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockResolvedValue({
        userId: 1,
        needsVerification: false,
      });
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        hasOnboarded: true,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard'),
      );
    });

    it('redirects to /login with the HttpException string body on failure', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new ForbiddenException('Account deactivated'),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          `/login?error=${encodeURIComponent('Account deactivated')}`,
        ),
      );
    });

    it('extracts the first message from an array-shaped validation error', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new BadRequestException(['first error', 'second error']),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('first error')),
      );
    });

    it('falls back to a generic message for a non-HttpException failure', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new Error('raw internal detail'),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          encodeURIComponent('Something went wrong. Please try again.'),
        ),
      );
    });

    it("uses an HttpException's raw string response body directly", async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new HttpException('raw string body', 400),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('raw string body')),
      );
    });

    it("falls back to the exception's own message when the payload has no usable message field", async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new HttpException({ error: 'Weird' }, 400),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('Http Exception')),
      );
    });

    it('logs "unknown" when the request has no user at all', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        new Error('boom'),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = {} as Request & { user: GoogleProfile };

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?error='),
      );
    });

    it('logs without a stack trace when the rejection is not an Error', async () => {
      const authService = makeAuthService();
      (authService.findOrCreateFromGoogle as jest.Mock).mockRejectedValue(
        'string rejection',
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();
      const req = makeReq({
        googleId: 'g1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatar: null,
      });

      await controller.googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          encodeURIComponent('Something went wrong. Please try again.'),
        ),
      );
    });
  });

  describe('resendVerification', () => {
    it('delegates and returns a confirmation message', async () => {
      const authService = makeAuthService();
      const controller = new AuthController(authService, makeUserService());

      const result = await controller.resendVerification({
        email: 'x@y.com',
      } as never);

      expect(authService.resendVerification).toHaveBeenCalledWith('x@y.com');
      expect(result).toEqual({ message: 'Verification email sent.' });
    });
  });

  describe('verifyEmail', () => {
    it('sets the cookie and redirects based on onboarding state', async () => {
      const authService = makeAuthService();
      (authService.verifyEmail as jest.Mock).mockResolvedValue(7);
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        hasOnboarded: true,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();

      await controller.verifyEmail('tok', res);

      expect(res.cookie).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard'),
      );
    });

    it('redirects to /login with an error message on failure', async () => {
      const authService = makeAuthService();
      (authService.verifyEmail as jest.Mock).mockRejectedValue(
        new BadRequestException('Invalid or already-used verification link.'),
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();

      await controller.verifyEmail('bad', res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?error='),
      );
    });

    it('redirects to /onboarding for a not-yet-onboarded user', async () => {
      const authService = makeAuthService();
      (authService.verifyEmail as jest.Mock).mockResolvedValue(7);
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        hasOnboarded: false,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();

      await controller.verifyEmail('tok', res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/onboarding'),
      );
    });

    it('logs without a stack trace when the rejection is not an Error', async () => {
      const authService = makeAuthService();
      (authService.verifyEmail as jest.Mock).mockRejectedValue(
        'string rejection',
      );
      const controller = new AuthController(authService, makeUserService());
      const res = makeResponse();

      await controller.verifyEmail('bad', res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?error='),
      );
    });
  });

  describe('getInvite', () => {
    it('delegates with the token', () => {
      const authService = makeAuthService();
      const controller = new AuthController(authService, makeUserService());

      void controller.getInvite('tok');
      expect(authService.getInviteInfo).toHaveBeenCalledWith('tok');
    });
  });

  describe('acceptInvite', () => {
    it('sets the cookie and returns the user with memberships', async () => {
      const authService = makeAuthService();
      (authService.acceptInvite as jest.Mock).mockResolvedValue(7);
      const userService = makeUserService();
      (userService.findByIdWithMemberships as jest.Mock).mockResolvedValue({
        id: 7,
      });
      const controller = new AuthController(authService, userService);
      const res = makeResponse();

      const result = await controller.acceptInvite(
        { token: 'tok' } as never,
        res,
      );

      expect(res.cookie).toHaveBeenCalled();
      expect(result).toEqual({ id: 7 });
    });
  });

  describe('declineInvite', () => {
    it('delegates and returns a confirmation message', async () => {
      const authService = makeAuthService();
      const controller = new AuthController(authService, makeUserService());

      const result = await controller.declineInvite({
        token: 'tok',
      } as never);

      expect(authService.declineInvite).toHaveBeenCalledWith({ token: 'tok' });
      expect(result).toEqual({ message: 'Invite declined.' });
    });
  });

  describe('logout', () => {
    it('clears the cookie and returns a confirmation message', () => {
      const controller = new AuthController(
        makeAuthService(),
        makeUserService(),
      );
      const res = makeResponse();

      const result = controller.logout(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.anything(),
      );
      expect(result).toEqual({ message: 'Logged out.' });
    });
  });

  describe('me', () => {
    it('delegates with the session user id', () => {
      const userService = makeUserService();
      const controller = new AuthController(makeAuthService(), userService);

      void controller.me(USER);
      expect(userService.findByIdWithMemberships).toHaveBeenCalledWith(7);
    });
  });

  describe('completeOnboarding', () => {
    it('delegates and returns a confirmation message', async () => {
      const authService = makeAuthService();
      const controller = new AuthController(authService, makeUserService());

      const result = await controller.completeOnboarding(USER);

      expect(authService.completeOnboarding).toHaveBeenCalledWith(7);
      expect(result).toEqual({ message: 'Onboarding complete.' });
    });
  });
});
