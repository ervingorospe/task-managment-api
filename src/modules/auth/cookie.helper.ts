import type { CookieOptions } from 'express';
import { AUTH_COOKIE_MAX_AGE_MS } from './auth.constants';

function baseAuthCookieOptions(): Omit<CookieOptions, 'maxAge'> {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}

/**
 * The backend (Render) and frontend (Vercel) are different origins, so a
 * cross-origin fetch only carries this cookie if it's `SameSite=None` +
 * `Secure` — but `Secure` cookies are rejected over plain HTTP, which local
 * dev is. Render sets NODE_ENV=production automatically for Node web
 * services, so this switches correctly without a dedicated env var.
 */
export function getAuthCookieOptions(): CookieOptions {
  return { ...baseAuthCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS };
}

/** Same flags used to set the cookie must be repeated to clear it — most
 * browsers otherwise won't reliably delete a `SameSite=None` cookie from a
 * `clearCookie()` call that omits them. */
export function getClearAuthCookieOptions(): CookieOptions {
  return baseAuthCookieOptions();
}
