/** httpOnly cookie the backend issues after a successful login/verify/accept
 * — deliberately a different name than the frontend's old plaintext
 * `ticketing_session` marker cookie (see auth-provider.tsx), since this one
 * carries a real signed JWT and is never read by client-side JS. */
export const AUTH_COOKIE_NAME = 'ticketing_auth';

export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Same cooldown member.service.ts already uses for invite resends. */
export const VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
