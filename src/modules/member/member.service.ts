import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computeInviteExpiry,
  markExpiredInvites,
} from '../../common/helper/invite-expiration.helper';
import type { MembersQueryDto } from './dto/members-query.dto';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import type { UpdateMemberActiveStateDto } from './dto/update-member-active-state.dto';

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async members(query: MembersQueryDto) {
    // The owner is surfaced separately via GET /organizations/:slug's
    // `owner` field (and gated by its own member.view.owner permission) —
    // never as a row in the members list, here or in the org-details
    // bundle (see OrganizationService.getDetailsWhere).
    const organization = await this.prisma.organization.findUnique({
      where: { id: query.orgId },
      select: { ownerId: true },
    });

    const where = {
      orgId: query.orgId,
      isDeleted: false,
      ...(organization ? { userId: { not: organization.ownerId } } : {}),
      ...(query.search
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sortBy === 'email'
        ? { email: 'asc' as const }
        : [{ firstName: 'asc' as const }, { lastName: 'asc' as const }];

    const page = query.page ?? 1;
    const limit = query.limit ?? 15;

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: true, role: true },
      }),
      this.prisma.member.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async invites(orgId: number) {
    await markExpiredInvites(this.prisma, orgId);
    return this.prisma.memberInvite.findMany({
      where: { orgId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(orgId: number, dto: InviteMemberDto) {
    // So a previous invite to this same email that's actually past its
    // expiry (but hasn't been read/swept since) doesn't wrongly block a
    // fresh invite with "already has a pending invitation."
    await markExpiredInvites(this.prisma, orgId);

    const pending = await this.prisma.memberInvite.findFirst({
      where: { orgId, email: dto.email, status: 'PENDING', isDeleted: false },
    });
    if (pending)
      throw new ConflictException(
        'This email already has a pending invitation.',
      );

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { orgId },
      select: { inviteExpiration: true },
    });

    return this.prisma.memberInvite.create({
      data: {
        orgId,
        email: dto.email,
        roleId: dto.roleId,
        expiry: computeInviteExpiry(settings?.inviteExpiration),
      },
    });
  }

  async resend(inviteId: number) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { id: inviteId, isDeleted: false },
    });
    if (!invite) throw new NotFoundException('Invite not found.');

    const isPastExpiry = invite.expiry != null && invite.expiry < new Date();
    if (invite.status !== 'PENDING' || isPastExpiry) {
      // Stored status may not have caught up yet (no background job) —
      // flip it now rather than leaving a stale PENDING row behind.
      if (isPastExpiry && invite.status === 'PENDING') {
        await this.prisma.memberInvite.update({
          where: { id: inviteId },
          data: { status: 'EXPIRED' },
        });
      }
      throw new BadRequestException('This invite is no longer pending.');
    }

    const lastAction = invite.lastSentAt ?? invite.createdAt;
    const elapsed = Date.now() - lastAction.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new BadRequestException(
        `Please wait ${waitSeconds}s before resending.`,
      );
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { orgId: invite.orgId },
      select: { inviteExpiration: true },
    });

    return this.prisma.memberInvite.update({
      where: { id: inviteId },
      data: {
        resentCount: { increment: 1 },
        lastSentAt: new Date(),
        // Resending gives it a fresh clock, same as a brand-new invite.
        expiry: computeInviteExpiry(settings?.inviteExpiration),
      },
    });
  }

  async removeInvite(inviteId: number) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { id: inviteId, isDeleted: false },
    });
    if (!invite) throw new NotFoundException('Invite not found.');

    return this.prisma.memberInvite.update({
      where: { id: inviteId },
      data: { isDeleted: true, status: 'CANCELLED' },
    });
  }

  async updateRole(memberId: number, dto: UpdateMemberRoleDto) {
    await this.findOrThrow(memberId);
    return this.prisma.member.update({
      where: { id: memberId },
      data: { roleId: dto.roleId },
      include: { role: true },
    });
  }

  async updateActiveState(memberId: number, dto: UpdateMemberActiveStateDto) {
    await this.findOrThrow(memberId);
    return this.prisma.member.update({
      where: { id: memberId },
      data: { isActive: dto.isActive },
    });
  }

  async remove(memberId: number) {
    const member = await this.findOrThrow(memberId);

    return this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { isDeleted: true, userId: null },
      });

      // "remove in users table, soft delete in members table" — the member
      // row stays (its firstName/lastName/email snapshot survives for
      // history), but the account behind it is deactivated. Not a hard
      // delete: the same user may still be a member of other organizations.
      if (member.userId) {
        await tx.user.update({
          where: { id: member.userId },
          data: { isDeleted: true, isActive: false },
        });
      }
    });
  }

  private async findOrThrow(memberId: number) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, isDeleted: false },
    });
    if (!member) throw new NotFoundException('Member not found.');
    return member;
  }
}
