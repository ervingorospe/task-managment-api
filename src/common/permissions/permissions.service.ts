import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface OrgMembership {
  memberId: number;
  roleId: number;
  rules: Set<string>;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's active membership + resolved rule set for one specific
   * organization — `null` if they aren't an active member there. A User
   * can hold many Member rows (one per org, each with its own Role), so
   * permissions are always resolved against the org a request concerns,
   * never against a single flat "the user's role". */
  async getMembership(
    userId: number,
    orgId: number,
  ): Promise<OrgMembership | null> {
    const member = await this.prisma.member.findFirst({
      where: { userId, orgId, isActive: true, isDeleted: false },
      select: {
        id: true,
        roleId: true,
        role: { select: { rules: { select: { action: true } } } },
      },
    });
    if (!member) return null;
    return {
      memberId: member.id,
      roleId: member.roleId,
      rules: new Set(member.role.rules.map((r) => r.action)),
    };
  }
}
