import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CapacityField = 'members' | 'tags' | 'roles' | 'tickets' | 'projects';

/**
 * Throws if `currentCount` is already at or over the organization's
 * configured limit for this field (see OrganizationCapacity in
 * schema.prisma). The caller computes currentCount itself, since what
 * counts as "current" differs per field — e.g. members counts active
 * members *and* pending invites together, since an invite reserves a seat
 * before it's ever accepted, not just active member.service.ts.
 *
 * A missing capacity row (shouldn't happen — every org gets one at
 * creation, see organization.service.ts) is treated as "no limit" rather
 * than blocking everything, since failing open here is safer than an
 * unrelated data gap silently locking an org out of its own features.
 */
export async function assertCapacity(
  prisma: PrismaService,
  orgId: number,
  field: CapacityField,
  currentCount: number,
  label: string,
): Promise<void> {
  const capacity = await prisma.organizationCapacity.findUnique({
    where: { orgId },
  });
  const limit = capacity?.[field];
  if (limit != null && currentCount >= limit) {
    throw new ForbiddenException(`${label} limit reached (${limit}).`);
  }
}
