import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from './cookie.helper';
import { AUTH_COOKIE_MAX_AGE_MS } from './auth.constants';

describe('cookie.helper', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('uses Secure + SameSite=None for the set-cookie options', () => {
      const options = getAuthCookieOptions();
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('none');
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(AUTH_COOKIE_MAX_AGE_MS);
    });

    it('uses the same flags for the clear-cookie options, minus maxAge', () => {
      const options = getClearAuthCookieOptions();
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('none');
      expect(options).not.toHaveProperty('maxAge');
    });
  });

  describe('outside production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('uses non-Secure + SameSite=Lax for local dev', () => {
      const options = getAuthCookieOptions();
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
    });
  });
});
