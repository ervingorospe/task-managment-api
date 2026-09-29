import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves the calling user's Member row id within an org — used to
 * attribute an action (e.g. MemberInvite.invitedBy/resentBy) to the
 * specific member who performed it. The caller must already have passed
 * PermissionsGuard for this org, so a missing row here means the guard's
 * own membership check and this lookup have gone out of sync, not a normal
 * "not a member" case.
 */
export async function resolveActingMemberId(
  prisma: PrismaService,
  orgId: number,
  userId: number,
): Promise<number> {
  const member = await prisma.member.findFirst({
    where: { orgId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!member) {
    throw new ForbiddenException('You are not a member of this organization.');
  }
  return member.id;
}
