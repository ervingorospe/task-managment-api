import type { PrismaService } from '../../prisma/prisma.service';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const DEFAULT_DURATION_KEY = '1_day';

/**
 * `durationKey` matches OrganizationSettings.inviteExpiration, e.g.
 * "2_hours", "1_day", "1_week", "1_month" — same keys the frontend's
 * invite-settings-section.tsx dropdown writes. An unrecognized key falls
 * back to the 1-day default rather than leaving the invite un-expiring.
 */
export function computeInviteExpiry(
  durationKey: string | null | undefined,
  from: Date = new Date(),
): Date {
  const [amountStr, unitRaw] = (durationKey || DEFAULT_DURATION_KEY).split('_');
  const amount = Number(amountStr) || 1;
  const unit = unitRaw?.replace(/s$/, '');

  const result = new Date(from);
  switch (unit) {
    case 'hour':
      result.setTime(result.getTime() + amount * MS_PER_HOUR);
      return result;
    case 'week':
      result.setTime(result.getTime() + amount * MS_PER_WEEK);
      return result;
    case 'month':
      result.setMonth(result.getMonth() + amount);
      return result;
    case 'day':
    default:
      result.setTime(result.getTime() + amount * MS_PER_DAY);
      return result;
  }
}

/**
 * Flips any PENDING invite past its expiry to EXPIRED before it's read —
 * there's no background job, so this is the only place that truth gets
 * applied. Callable from any module's service without a cross-module
 * dependency, since it just takes the PrismaService each already has.
 */
export function markExpiredInvites(prisma: PrismaService, orgId: number) {
  return prisma.memberInvite.updateMany({
    where: {
      orgId,
      status: 'PENDING',
      isDeleted: false,
      expiry: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}
