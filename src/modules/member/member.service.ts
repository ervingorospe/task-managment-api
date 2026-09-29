import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../../common/helper/public-user-select.helper';
import { assertCapacity } from '../../common/helper/assert-capacity.helper';
import { resolveActingMemberId } from '../../common/helper/resolve-acting-member.helper';
import { SesService } from '../email/ses.service';
import { renderMemberInviteEmail } from '../email/templates/member-invite.template';
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
  private readonly logger = new Logger(MemberService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ses: SesService,
  ) {}

  // Sent *before* the invite row is created/updated (see invite() and
  // resend() below) — a pending invite the invitee was never actually
  // notified about is worse than no invite at all, so a failed send
  // throws and nothing gets persisted. No token/accept-invite page exists
  // yet, so the link just goes to the frontend's root, which redirects to
  // /login — see .env.example.
  private async sendInviteEmail(
    to: string,
    orgId: number,
    roleId: number,
    expiry: Date | null,
    token: string,
    inviterName?: string,
  ) {
    const [organization, role] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        include: { settings: true },
      }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!organization) throw new NotFoundException('Organization not found.');
    if (!role) throw new NotFoundException('Role not found.');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const { subject, html, text } = renderMemberInviteEmail({
      organizationName: organization.organizationName,
      organizationLogo: organization.settings?.logo,
      inviterName: inviterName?.trim() || 'A team member',
      roleName: role.roleName,
      acceptUrl: `${frontendUrl}/accept-invite?token=${token}`,
      expiresAt: expiry,
    });

    try {
      await this.ses.send({ to, subject, html, text });
      this.logger.log(`Invite email sent to ${to}`);
    } catch (error) {
      this.logger.warn(
        `Failed to send invite email to ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
      const detail = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to send invite email: ${detail}`,
      );
    }
  }

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
        include: { user: { select: PUBLIC_USER_SELECT }, role: true },
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

  async invite(orgId: number, dto: InviteMemberDto, actingUserId: number) {
    const invitedBy = await resolveActingMemberId(
      this.prisma,
      orgId,
      actingUserId,
    );

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

    // A pending invite reserves a seat before it's ever accepted, so it
    // counts toward the member limit right alongside already-active
    // members — otherwise an org could invite far more people than its
    // capacity the moment those invites are sent, not just once accepted.
    const [activeMemberCount, pendingInviteCount] = await Promise.all([
      this.prisma.member.count({ where: { orgId, isDeleted: false } }),
      this.prisma.memberInvite.count({
        where: { orgId, status: 'PENDING', isDeleted: false },
      }),
    ]);
    await assertCapacity(
      this.prisma,
      orgId,
      'members',
      activeMemberCount + pendingInviteCount,
      'Member',
    );

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { orgId },
      select: { inviteExpiration: true },
    });
    const expiry = computeInviteExpiry(settings?.inviteExpiration);
    const token = randomBytes(32).toString('hex');

    // Send first — throws (and creates nothing) if it fails, so there's
    // never a pending invite the invitee was never actually told about.
    await this.sendInviteEmail(
      dto.email,
      orgId,
      dto.roleId,
      expiry,
      token,
      dto.inviterName,
    );

    return this.prisma.memberInvite.create({
      data: {
        orgId,
        email: dto.email,
        roleId: dto.roleId,
        expiry,
        token,
        invitedBy,
      },
    });
  }

  async resend(inviteId: number, actingUserId: number) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { id: inviteId, isDeleted: false },
    });
    if (!invite) throw new NotFoundException('Invite not found.');

    const resentBy = await resolveActingMemberId(
      this.prisma,
      invite.orgId,
      actingUserId,
    );

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
    // Resending gives it a fresh clock, same as a brand-new invite.
    const expiry = computeInviteExpiry(settings?.inviteExpiration);
    // Same token as before — this is the same invite, just resent, not a
    // new one. Only generates one if this row predates the token field.
    const token = invite.token ?? randomBytes(32).toString('hex');

    // Send first — if it fails, resentCount/lastSentAt/expiry/token stay
    // untouched, same "don't persist what didn't actually go out" rule
    // as invite().
    await this.sendInviteEmail(
      invite.email,
      invite.orgId,
      invite.roleId,
      expiry,
      token,
    );

    return this.prisma.memberInvite.update({
      where: { id: inviteId },
      data: {
        resentCount: { increment: 1 },
        lastSentAt: new Date(),
        expiry,
        token,
        resentBy,
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
