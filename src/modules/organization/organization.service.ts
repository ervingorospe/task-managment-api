import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../../common/helper/public-user-select.helper';
import { S3Service } from '../storage/s3.service';
import { SesService } from '../email/ses.service';
import { renderMemberInviteEmail } from '../email/templates/member-invite.template';
import { computeInviteExpiry } from '../../common/helper/invite-expiration.helper';
import { baseSlug } from '../../common/helper/slug.helper';
import { retryOnUniqueConflict } from '../../common/helper/retry-on-conflict.helper';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateOrgBasicInfoDto } from './dto/update-org-basic-info.dto';
import type { UpdateOrgTimezoneDto } from './dto/update-org-timezone.dto';
import type { UpdateOrgInviteExpirationDto } from './dto/update-org-invite-expiration.dto';
import type { UpdateOrgNotificationsDto } from './dto/update-org-notifications.dto';
import type { UpdateOrgActiveStateDto } from './dto/update-org-active-state.dto';
import type { RequestOwnershipTransferDto } from './dto/request-ownership-transfer.dto';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly ses: SesService,
  ) {}

  private async uniqueSlug(name: string): Promise<string> {
    const base = baseSlug(name);
    let candidate = base;
    let suffix = 2;
    while (
      await this.prisma.organizationSettings.findUnique({
        where: { slug: candidate },
      })
    ) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  async create(dto: CreateOrganizationDto, ownerId: number) {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, isDeleted: false },
    });
    if (!owner) throw new BadRequestException('ownerId does not exist.');

    // No accountType gate here (or anywhere else) — any authenticated,
    // verified user can create an organization. It's how someone becomes a
    // member of anything in the first place (they're assigned the new
    // org's Superadmin role), so it can't itself depend on already holding
    // a rule somewhere.
    const existing = await this.prisma.organization.findFirst({
      where: {
        ownerId,
        organizationName: dto.organizationName,
        isDeleted: false,
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an organization with this name.',
      );
    }

    try {
      // uniqueSlug() reads then the transaction writes — not atomic, so a
      // concurrent create() with the same name can slip in between and
      // collide on the slug. Recompute a fresh slug and retry rather than
      // failing the whole signup.
      return await retryOnUniqueConflict(() =>
        this.createWithFreshSlug(dto, owner),
      );
    } catch (error) {
      this.logger.error(
        `Failed to create organization "${dto.organizationName}" for owner ${ownerId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async createWithFreshSlug(
    dto: CreateOrganizationDto,
    owner: {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
    },
  ) {
    const slug = await this.uniqueSlug(dto.organizationName);

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ownerId: owner.id,
          organizationName: dto.organizationName,
          organizationDesc: dto.organizationDesc,
          email: dto.email,
          website: dto.website,
        },
      });

      await tx.organizationSettings.create({
        data: {
          orgId: organization.id,
          slug,
          logo: dto.logo,
          timezone: dto.timezone,
        },
      });

      await tx.organizationCapacity.create({
        data: { orgId: organization.id },
      });

      // dto.roles carries client-side ids (often the four global template
      // ids) — this map resolves those to the real, org-scoped row ids so
      // invites[].roleId (which references the same client-side ids) can be
      // rewritten correctly below.
      const roleIdMap = new Map<number, number>();
      let superadminRoleId: number | null = null;

      for (const roleDto of dto.roles) {
        const role = await tx.role.create({
          data: {
            orgId: organization.id,
            roleName: roleDto.roleName,
            roleDesc: roleDto.roleDesc,
            isDefault: roleDto.isDefault,
            isLocked: roleDto.roleName === 'Superadmin',
            rules: { connect: roleDto.rules.map((r) => ({ id: r.id })) },
          },
        });
        if (roleDto.id != null) roleIdMap.set(roleDto.id, role.id);
        if (roleDto.roleName === 'Superadmin') superadminRoleId = role.id;
      }

      if (!superadminRoleId) {
        throw new BadRequestException('roles must include a Superadmin role.');
      }

      await tx.member.create({
        data: {
          orgId: organization.id,
          userId: owner.id,
          roleId: superadminRoleId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
        },
      });

      // Creating an organization is one of the two onboarding paths (the
      // other is choosing "Personal") — mark it done here so a fresh
      // owner who picks "Organization" doesn't get bounced straight back
      // to /onboarding after landing in the org they just made.
      await tx.user.update({
        where: { id: owner.id },
        data: { hasOnboarded: true },
      });

      for (const tagDto of dto.tags) {
        await tx.tag.create({
          data: {
            orgId: organization.id,
            tagName: tagDto.tagName,
            color: tagDto.color,
            isDefault: tagDto.isDefault,
          },
        });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const inviterName = `${owner.firstName} ${owner.lastName}`.trim();

      for (const inviteDto of dto.invites) {
        const resolvedRoleId = roleIdMap.get(inviteDto.roleId);
        if (!resolvedRoleId) {
          throw new BadRequestException(
            `invites[].roleId ${inviteDto.roleId} does not match any role in roles[].`,
          );
        }

        const roleDto = dto.roles.find((r) => r.id === inviteDto.roleId);
        const token = randomBytes(32).toString('hex');
        const expiry = computeInviteExpiry(undefined);

        const { subject, html, text } = renderMemberInviteEmail({
          organizationName: organization.organizationName,
          organizationLogo: dto.logo,
          inviterName: inviterName || 'A team member',
          roleName: roleDto?.roleName ?? 'Member',
          acceptUrl: `${frontendUrl}/accept-invite?token=${token}`,
          expiresAt: expiry,
        });

        try {
          await this.ses.send({ to: inviteDto.email, subject, html, text });
        } catch (error) {
          // A flaky send on one invite shouldn't sink the whole org the
          // owner just spent a multi-step wizard creating — skip this one
          // (same "never persist a pending invite that wasn't actually
          // communicated" rule as member.service.ts's invite(), just
          // scoped to this row instead of the whole transaction) and let
          // the owner send it again later from the Members page.
          this.logger.warn(
            `Failed to send invite email to ${inviteDto.email} during org creation`,
            error instanceof Error ? error.stack : undefined,
          );
          continue;
        }

        await tx.memberInvite.create({
          data: {
            orgId: organization.id,
            roleId: resolvedRoleId,
            email: inviteDto.email,
            expiry,
            token,
          },
        });
      }

      return this.getDetailsBySlug(slug, tx);
    });
  }

  async myOwnOrganizations(ownerId: number) {
    const orgs = await this.prisma.organization.findMany({
      where: { ownerId, isDeleted: false },
      orderBy: { id: 'asc' },
      include: { settings: { select: { slug: true } } },
    });

    return orgs.map((org) => ({
      id: org.id,
      organizationName: org.organizationName,
      organizationDesc: org.organizationDesc,
      slug: org.settings?.slug,
    }));
  }

  /** `tx` accepts either the main PrismaService or a `$transaction` callback client. */
  async getDetailsBySlug(slug: string, tx: any = this.prisma) {
    return this.getDetailsWhere({ settings: { slug }, isDeleted: false }, tx);
  }

  /** Same shape as getDetailsBySlug, keyed by the numeric id instead —
   * for callers (like a ticket, which only carries orgId) that don't have
   * the slug on hand. */
  async getDetailsById(orgId: number, tx: any = this.prisma) {
    return this.getDetailsWhere({ id: orgId, isDeleted: false }, tx);
  }

  private async getDetailsWhere(where: any, tx: any = this.prisma) {
    const organization = await tx.organization.findFirst({
      where,
      include: {
        owner: { select: PUBLIC_USER_SELECT },
        settings: true,
        capacity: true,
        roles: {
          where: { isDeleted: false },
          orderBy: { roleName: 'asc' },
          include: { rules: true },
        },
        // Not alphabetized on purpose — tags are typically a status
        // pipeline (Backlog → To Do → In-Progress → Done), and insertion
        // order preserves that; alphabetical would scramble it.
        tags: { where: { isDeleted: false } },
        members: {
          where: { isDeleted: false },
          // role needs its rules nested — this is what usePermission() on
          // the frontend checks after login, and an empty rules array
          // silently makes every permission check fail rather than error.
          include: {
            user: { select: PUBLIC_USER_SELECT },
            role: { include: { rules: true } },
          },
        },
        // EXPIRED (not just PENDING) so an invite that just aged out stays
        // visible in the pending-invitations list with that state, instead
        // of silently disappearing — see the expiry sweep just below.
        invites: {
          where: { isDeleted: false, status: { in: ['PENDING', 'EXPIRED'] } },
        },
      },
    });

    if (!organization) throw new NotFoundException('Organization not found.');

    // No background job flips PENDING -> EXPIRED, so it happens lazily
    // here, the moment someone reads the org. Computed in memory against
    // the rows already fetched above (cheap), then persisted for anyone
    // else reading this org before its next natural refresh.
    const now = new Date();
    const invites = organization.invites.map((invite: any) =>
      invite.status === 'PENDING' && invite.expiry && invite.expiry < now
        ? { ...invite, status: 'EXPIRED' }
        : invite,
    );
    const justExpiredIds = invites
      .filter(
        (invite: any, i: number) =>
          invite.status !== organization.invites[i].status,
      )
      .map((invite: any) => invite.id);
    if (justExpiredIds.length > 0) {
      await tx.memberInvite.updateMany({
        where: { id: { in: justExpiredIds } },
        data: { status: 'EXPIRED' },
      });
    }

    // An expired ownership transfer shouldn't keep showing as "in
    // progress" — only a still-PENDING one blocks the banner (and, per
    // requestOwnershipTransfer's own check, blocks starting a new one).
    const pendingOwnershipTransfer = invites.find(
      (invite: any) =>
        invite.type === 'OWNERSHIP' && invite.status === 'PENDING',
    );
    const pendingInvites = invites.filter(
      (invite: any) => invite.type === 'MEMBERSHIP',
    );
    // The owner is surfaced separately as `owner` above (and gated by its
    // own member.view.owner permission on the frontend) — never as a row
    // in `members` itself, matching MemberService.members().
    const members = organization.members.filter(
      (member: any) => member.userId !== organization.ownerId,
    );

    return {
      id: organization.id,
      organizationName: organization.organizationName,
      organizationDesc: organization.organizationDesc,
      email: organization.email,
      website: organization.website,
      settings: organization.settings,
      capacity: organization.capacity,
      owner: organization.owner,
      roles: organization.roles,
      tags: organization.tags,
      members,
      pendingInvites,
      pendingOwnershipTransfer: pendingOwnershipTransfer ?? null,
    };
  }

  async updateBasicInfo(orgId: number, dto: UpdateOrgBasicInfoDto) {
    const organization = await this.findActiveOrThrow(orgId);

    if (
      dto.organizationName &&
      dto.organizationName !== organization.organizationName
    ) {
      const clash = await this.prisma.organization.findFirst({
        where: {
          ownerId: organization.ownerId,
          organizationName: dto.organizationName,
          isDeleted: false,
          NOT: { id: orgId },
        },
      });
      if (clash)
        throw new ConflictException(
          'You already have an organization with this name.',
        );
    }

    return this.prisma.organization.update({ where: { id: orgId }, data: dto });
  }

  /** Uploads to S3 and persists the result as the org's logo in one step —
   * a single action gated by organization.update.logo, not two calls the
   * frontend has to sequence itself. */
  async uploadLogo(orgId: number, file: Express.Multer.File) {
    await this.findActiveOrThrow(orgId);
    const uploaded = await this.s3.upload(file);
    await this.prisma.organizationSettings.update({
      where: { orgId },
      data: { logo: uploaded.url },
    });
    return uploaded;
  }

  async updateTimezone(orgId: number, dto: UpdateOrgTimezoneDto) {
    await this.findActiveOrThrow(orgId);
    return this.prisma.organizationSettings.update({
      where: { orgId },
      data: { timezone: dto.timezone },
    });
  }

  async updateInviteExpiration(
    orgId: number,
    dto: UpdateOrgInviteExpirationDto,
  ) {
    await this.findActiveOrThrow(orgId);
    return this.prisma.organizationSettings.update({
      where: { orgId },
      data: { inviteExpiration: dto.inviteExpiration },
    });
  }

  async updateNotifications(orgId: number, dto: UpdateOrgNotificationsDto) {
    await this.findActiveOrThrow(orgId);
    return this.prisma.organizationSettings.update({
      where: { orgId },
      data: { sendEmailNotif: dto.sendEmailNotif },
    });
  }

  async updateActiveState(orgId: number, dto: UpdateOrgActiveStateDto) {
    await this.findActiveOrThrow(orgId);
    return this.prisma.organizationSettings.update({
      where: { orgId },
      data: { isActive: dto.isActive },
    });
  }

  /**
   * Hard delete — not a soft delete. Every org-scoped table (settings,
   * capacity, roles, tags, members, invites, tickets and their
   * comments/attachments, requests and their attachments) is FK'd to
   * Organization with `onDelete: Cascade` in the schema, so deleting the
   * org row removes all of it in one statement. ActivityLogEntry has no
   * FK here by design (it's an append-only audit log that copies the
   * data it needs onto each row, so it keeps reading correctly after the
   * things it describes are gone) — those rows are deliberately left
   * alone.
   *
   * A user whose ONLY tie to the system was this org (owned it, or was a
   * member of it, and nothing else) is deleted too. A user who owns or
   * belongs to another org is left untouched — this is checked per user
   * after the org is gone, since that's the only way to know whether
   * their membership row here was their last one.
   */
  async remove(orgId: number) {
    const organization = await this.findActiveOrThrow(orgId);

    const members = await this.prisma.member.findMany({
      where: { orgId, userId: { not: null } },
      select: { userId: true },
    });
    const candidateUserIds = new Set<number>(
      members.map((m) => m.userId as number),
    );
    candidateUserIds.add(organization.ownerId);

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.delete({ where: { id: orgId } });

      for (const userId of candidateUserIds) {
        const [ownsElsewhere, memberElsewhere] = await Promise.all([
          tx.organization.findFirst({
            where: { ownerId: userId, isDeleted: false },
          }),
          tx.member.findFirst({
            where: { userId, isDeleted: false },
          }),
        ]);
        if (!ownsElsewhere && !memberElsewhere) {
          await tx.user.delete({ where: { id: userId } });
        }
      }
    });
  }

  async requestOwnershipTransfer(
    orgId: number,
    dto: RequestOwnershipTransferDto,
  ) {
    await this.findActiveOrThrow(orgId);

    // Only an existing pending OWNERSHIP invite should block this — a
    // pending MEMBERSHIP invite (very common; any org with an open invite
    // to a new member) is unrelated and shouldn't stop an owner from
    // starting a transfer.
    const pending = await this.prisma.memberInvite.findFirst({
      where: { orgId, type: 'OWNERSHIP', status: 'PENDING', isDeleted: false },
    });
    if (pending) {
      throw new ConflictException(
        'This organization already has a pending ownership transfer.',
      );
    }

    const superadminRole = await this.prisma.role.findFirst({
      where: { orgId, roleName: 'Superadmin' },
    });
    if (!superadminRole)
      throw new NotFoundException('Superadmin role not found for this org.');

    return this.prisma.memberInvite.create({
      data: {
        orgId,
        roleId: superadminRole.id,
        email: dto.email,
        type: 'OWNERSHIP',
      },
    });
  }

  async cancelOwnershipTransfer(orgId: number) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { orgId, type: 'OWNERSHIP', status: 'PENDING', isDeleted: false },
    });
    if (!invite) throw new NotFoundException('No pending ownership transfer.');

    return this.prisma.memberInvite.update({
      where: { id: invite.id },
      data: { status: 'CANCELLED', isDeleted: true },
    });
  }

  async defaultRoles() {
    return this.prisma.role.findMany({
      where: { orgId: null, isDeleted: false },
      orderBy: { roleName: 'asc' },
      include: { rules: true },
    });
  }

  async defaultTags() {
    return this.prisma.tag.findMany({
      where: { orgId: null, isDeleted: false },
    });
  }

  async defaultPermissions() {
    return this.prisma.ruleCategory.findMany({ include: { rules: true } });
  }

  private async findActiveOrThrow(orgId: number) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: orgId, isDeleted: false },
    });
    if (!organization) throw new NotFoundException('Organization not found.');
    return organization;
  }
}
