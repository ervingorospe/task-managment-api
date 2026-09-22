import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Looks a user up by email with every organization they're a member of
   * (role + rules, organization + settings) — this is what the frontend's
   * login needs now that it isn't reading a local mock accounts list: find
   * the user, then build its `memberships` from real rows.
   */
  async findByEmailWithMemberships(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isDeleted: false,
      },
      include: {
        memberships: {
          where: { isDeleted: false },
          include: {
            role: { include: { rules: true } },
            organization: { include: { settings: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async update(userId: number, dto: UpdateUserDto) {
    await this.findOrThrow(userId);
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  /** Just the upload — the caller still PATCHes :userId with the returned
   * url to actually set it as the user's avatar. Same two-step shape as
   * organization logo uploads. */
  async uploadAvatar(userId: number, file: Express.Multer.File) {
    await this.findOrThrow(userId);
    return this.s3.upload(file);
  }

  private async findOrThrow(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
