import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

const BCRYPT_ROUNDS = 10;

// Never return passwordHash/verificationToken/verificationTokenExpiry/
// googleId to a client — an explicit whitelist here means a future new
// sensitive column on User doesn't leak by default the way it would with
// `include`/a bare `findFirst()`, which return every column.
const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  isActive: true,
  isDeleted: true,
  isVerified: true,
  hasOnboarded: true,
  createdViaInvite: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MEMBERSHIPS_SELECT = {
  where: { isDeleted: false },
  include: {
    role: { include: { rules: true } },
    organization: { include: { settings: true } },
  },
} as const;

/** passwordHash is fetched alongside the safe columns above (never
 * returned as-is) purely to derive `hasPassword` — the frontend needs to
 * know whether an account can be signed into with a password at all (a
 * Google-only account has none) without ever seeing the hash itself. */
function withHasPassword<T extends { passwordHash: string | null }>(
  user: T,
): Omit<T, 'passwordHash'> & { hasPassword: boolean } {
  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: passwordHash != null };
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * A user with every organization they're a member of (role + rules,
   * organization + settings) — what GET /auth/me returns for session
   * restore, and what login()/verify-email/Google OAuth all return right
   * after issuing a session.
   */
  async findByIdWithMemberships(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: {
        ...SAFE_USER_SELECT,
        passwordHash: true,
        memberships: MEMBERSHIPS_SELECT,
      },
    });

    if (!user) throw new NotFoundException('User not found.');
    return withHasPassword(user);
  }

  async update(userId: number, dto: UpdateUserDto) {
    await this.findOrThrow(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { ...SAFE_USER_SELECT, passwordHash: true },
    });
    return withHasPassword(user);
  }

  /** Just the upload — the caller still PATCHes :userId with the returned
   * url to actually set it as the user's avatar. Same two-step shape as
   * organization logo uploads. */
  async uploadAvatar(userId: number, file: Express.Multer.File) {
    await this.findOrThrow(userId);
    return this.s3.upload(file, 'profile');
  }

  /** currentPassword is only required when the account already has a
   * password — a Google-only account (passwordHash null) is setting one
   * for the first time, not changing an existing one, so there's nothing
   * to verify against. */
  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }

    const user = await this.findOrThrow(userId);

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Enter your current password.');
      }
      const matches = await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!matches) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /** Soft-deletes the caller's own account. An invite-only account (never
   * signed up directly, see User.createdViaInvite) can't do this — it
   * mirrors the same restriction on organization creation, since both are
   * things only an account that chose to exist on its own terms should be
   * able to do. */
  async deleteAccount(userId: number): Promise<void> {
    const user = await this.findOrThrow(userId);

    if (user.createdViaInvite) {
      throw new ForbiddenException(
        'An account created from an invite cannot delete itself. Ask an admin to remove your membership instead.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isDeleted: true, isActive: false },
    });
  }

  private async findOrThrow(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
