import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../../common/helper/public-user-select.helper';
import { assertCapacity } from '../../common/helper/assert-capacity.helper';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

const PROJECT_INCLUDE = {
  client: { include: { user: { select: PUBLIC_USER_SELECT } } },
  assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
} as const;

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Superadmin/Admin (project.view) see every project; everyone else who
   * can reach this at all (guarded by project.view OR project.view.own)
   * only sees projects they're assigned to — returns the assigned-only
   * member id in that case, or null when the caller can see everything.
   * Server-derived from the caller's actual rules — never trusts a
   * client-supplied "show mine" flag — so this is a real visibility
   * boundary, not just a frontend convenience filter. */
  private async restrictedToMemberId(
    orgId: number,
    userId: number,
  ): Promise<number | null> {
    const membership = await this.permissions.getMembership(userId, orgId);
    if (membership?.rules.has(PERMISSIONS.PROJECT_VIEW)) return null;
    return membership?.memberId ?? -1;
  }

  async projects(orgId: number, userId: number) {
    const restrictedTo = await this.restrictedToMemberId(orgId, userId);
    return this.prisma.project.findMany({
      where: {
        orgId,
        isDeleted: false,
        ...(restrictedTo != null
          ? { assignees: { some: { id: restrictedTo } } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: PROJECT_INCLUDE,
    });
  }

  async findOne(projectId: number, userId: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found.');

    const restrictedTo = await this.restrictedToMemberId(project.orgId, userId);
    if (
      restrictedTo != null &&
      !project.assignees.some((a) => a.id === restrictedTo)
    ) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  async create(orgId: number, dto: CreateProjectDto) {
    const activeClash = await this.prisma.project.findFirst({
      where: { orgId, name: dto.name, isDeleted: false },
    });
    if (activeClash) {
      throw new ConflictException('A project with this name already exists.');
    }

    // Applies whether this ends up reviving a soft-deleted project or
    // creating a brand new one — both result in one more active project.
    const activeCount = await this.prisma.project.count({
      where: { orgId, isDeleted: false },
    });
    await assertCapacity(
      this.prisma,
      orgId,
      'projects',
      activeCount,
      'Project',
    );

    const assignees = dto.assigneeIds
      ? { connect: dto.assigneeIds.map((id) => ({ id })) }
      : undefined;

    // Reuse a soft-deleted project with the same name instead of inserting
    // a second row for it — same rule tag.service.ts/role.service.ts apply
    // to their own soft-deleted rows.
    const existingDeleted = await this.prisma.project.findFirst({
      where: { orgId, name: dto.name, isDeleted: true },
    });
    if (existingDeleted) {
      return this.prisma.project.update({
        where: { id: existingDeleted.id },
        data: {
          description: dto.description,
          clientId: dto.clientId,
          isDeleted: false,
          assignees: { set: dto.assigneeIds?.map((id) => ({ id })) ?? [] },
        },
        include: PROJECT_INCLUDE,
      });
    }

    return this.prisma.project.create({
      data: {
        orgId,
        name: dto.name,
        description: dto.description,
        clientId: dto.clientId,
        assignees,
      },
      include: PROJECT_INCLUDE,
    });
  }

  async update(projectId: number, dto: UpdateProjectDto) {
    const project = await this.findOrThrow(projectId);

    if (dto.name && dto.name !== project.name) {
      const clash = await this.prisma.project.findFirst({
        where: {
          orgId: project.orgId,
          name: dto.name,
          isDeleted: false,
          NOT: { id: projectId },
        },
      });
      if (clash) {
        throw new ConflictException('A project with this name already exists.');
      }
    }

    const { assigneeIds, ...rest } = dto;

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...rest,
        assignees:
          assigneeIds !== undefined
            ? { set: assigneeIds.map((id) => ({ id })) }
            : undefined,
      },
      include: PROJECT_INCLUDE,
    });
  }

  async remove(projectId: number) {
    await this.findOrThrow(projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { isDeleted: true },
    });
  }

  private async findOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }
}
