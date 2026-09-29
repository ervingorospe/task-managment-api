import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCapacity } from '../../common/helper/assert-capacity.helper';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleRulesDto } from './dto/update-role-rules.dto';
import type { UpdateRoleInfoDto } from './dto/update-role-info.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  categories() {
    return this.prisma.ruleCategory.findMany({
      orderBy: { name: 'asc' },
      include: { rules: true },
    });
  }

  roles(orgId: number) {
    return this.prisma.role.findMany({
      where: { orgId, isDeleted: false },
      orderBy: { roleName: 'asc' },
      include: { rules: true },
    });
  }

  async create(orgId: number, dto: CreateRoleDto) {
    // Reuse a soft-deleted role with the same name instead of creating a
    // second row for it (constraint: role names are unique per org, but
    // soft-deleted rows don't count against a *new* name — they get revived).
    const existingDeleted = await this.prisma.role.findFirst({
      where: { orgId, roleName: dto.roleName, isDeleted: true },
    });

    const activeClash = await this.prisma.role.findFirst({
      where: { orgId, roleName: dto.roleName, isDeleted: false },
    });
    if (activeClash) {
      throw new ConflictException('A role with this name already exists.');
    }

    // Applies whether this ends up reviving a soft-deleted role or
    // creating a brand new one — both result in one more active role.
    const activeCount = await this.prisma.role.count({
      where: { orgId, isDeleted: false },
    });
    await assertCapacity(this.prisma, orgId, 'roles', activeCount, 'Role');

    if (existingDeleted) {
      return this.prisma.role.update({
        where: { id: existingDeleted.id },
        data: {
          roleDesc: dto.roleDesc,
          isDeleted: false,
          isDefault: false,
          rules: { set: dto.rules.map((r) => ({ id: r.id })) },
        },
        include: { rules: true },
      });
    }

    return this.prisma.role.create({
      data: {
        orgId,
        roleName: dto.roleName,
        roleDesc: dto.roleDesc,
        rules: { connect: dto.rules.map((r) => ({ id: r.id })) },
      },
      include: { rules: true },
    });
  }

  async updateRules(roleId: number, dto: UpdateRoleRulesDto) {
    const role = await this.findOrThrow(roleId);
    if (role.isLocked)
      throw new ForbiddenException('This role cannot be edited.');

    return this.prisma.role.update({
      where: { id: roleId },
      data: { rules: { set: dto.rules.map((r) => ({ id: r.id })) } },
      include: { rules: true },
    });
  }

  async updateInfo(roleId: number, dto: UpdateRoleInfoDto) {
    const role = await this.findOrThrow(roleId);
    if (role.isLocked)
      throw new ForbiddenException('This role cannot be edited.');

    if (dto.roleName && dto.roleName !== role.roleName) {
      const clash = await this.prisma.role.findFirst({
        where: {
          orgId: role.orgId,
          roleName: dto.roleName,
          isDeleted: false,
          NOT: { id: roleId },
        },
      });
      if (clash)
        throw new ConflictException('A role with this name already exists.');
    }

    return this.prisma.role.update({ where: { id: roleId }, data: dto });
  }

  async remove(roleId: number) {
    const role = await this.findOrThrow(roleId);
    if (role.isLocked)
      throw new ForbiddenException('This role cannot be removed.');
    if (role.orgId == null)
      throw new BadRequestException('Global role templates cannot be removed.');

    const fallbackRole = await this.prisma.role.findFirst({
      where: { orgId: role.orgId, roleName: 'Member', isDeleted: false },
    });
    if (!fallbackRole) {
      throw new BadRequestException(
        'No default Member role found to reassign this role’s members to.',
      );
    }

    return this.prisma.$transaction([
      this.prisma.member.updateMany({
        where: { roleId },
        data: { roleId: fallbackRole.id },
      }),
      this.prisma.role.update({
        where: { id: roleId },
        data: { isDeleted: true },
      }),
    ]);
  }

  private async findOrThrow(roleId: number) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, isDeleted: false },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }
}
