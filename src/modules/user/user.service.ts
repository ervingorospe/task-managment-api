import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { UpdateUserDto } from './dto/update-user.dto';

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
      select: { ...SAFE_USER_SELECT, memberships: MEMBERSHIPS_SELECT },
    });

    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async update(userId: number, dto: UpdateUserDto) {
    await this.findOrThrow(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: SAFE_USER_SELECT,
    });
  }

  /** Just the upload — the caller still PATCHes :userId with the returned
   * url to actually set it as the user's avatar. Same two-step shape as
   * organization logo uploads. */
  async uploadAvatar(userId: number, file: Express.Multer.File) {
    await this.findOrThrow(userId);
    return this.s3.upload(file, 'profile');
  }

  private async findOrThrow(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
