import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as exempt from auth/permission checks once those guards are
 * wired in globally. Unused today (nothing is guarded yet), but routes that
 * should stay open forever — health checks, login, signup — should carry
 * this from the start so nobody has to remember it later.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
