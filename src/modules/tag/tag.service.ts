import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddTagDto } from './dto/add-tag.dto';
import type { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  tags(orgId: number) {
    return this.prisma.tag.findMany({
      where: { orgId, isDeleted: false },
      orderBy: { tagName: 'asc' },
    });
  }

  async add(orgId: number, dto: AddTagDto) {
    const activeClash = await this.prisma.tag.findFirst({
      where: { orgId, tagName: dto.tagName, isDeleted: false },
    });
    if (activeClash)
      throw new ConflictException('A tag with this name already exists.');

    // Reuse a soft-deleted tag with the same name instead of inserting a
    // second row for it.
    const existingDeleted = await this.prisma.tag.findFirst({
      where: { orgId, tagName: dto.tagName, isDeleted: true },
    });
    if (existingDeleted) {
      return this.prisma.tag.update({
        where: { id: existingDeleted.id },
        data: { color: dto.color, isDeleted: false, isDefault: false },
      });
    }

    return this.prisma.tag.create({
      data: { orgId, tagName: dto.tagName, color: dto.color },
    });
  }

  async update(tagId: number, dto: UpdateTagDto) {
    const tag = await this.findOrThrow(tagId);

    if (dto.tagName && dto.tagName !== tag.tagName) {
      const clash = await this.prisma.tag.findFirst({
        where: {
          orgId: tag.orgId,
          tagName: dto.tagName,
          isDeleted: false,
          NOT: { id: tagId },
        },
      });
      if (clash) {
        throw new ConflictException('A tag with this name already exists.');
      }
    }

    return this.prisma.tag.update({ where: { id: tagId }, data: dto });
  }

  async remove(tagId: number) {
    const tag = await this.findOrThrow(tagId);
    if (tag.orgId == null)
      throw new BadRequestException('Global tag templates cannot be removed.');

    const remaining = await this.prisma.tag.count({
      where: { orgId: tag.orgId, isDeleted: false },
    });
    if (remaining <= 1) {
      throw new ConflictException(
        'An organization must keep at least one tag.',
      );
    }

    return this.prisma.tag.update({
      where: { id: tagId },
      data: { isDeleted: true },
    });
  }

  private async findOrThrow(tagId: number) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, isDeleted: false },
    });
    if (!tag) throw new NotFoundException('Tag not found.');
    return tag;
  }
}
