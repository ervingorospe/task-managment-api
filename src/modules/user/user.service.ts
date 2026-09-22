import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Looks a user up by email with every organization they're a member of
   * (role + rules, organization + settings) — this is what the frontend's
   * login needs now that it isn't reading a local mock accounts list: find
   * the user, then build its `memberships` from real rows.
   */
  async findByEmailWithMemberships(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isDeleted: false },
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
}
