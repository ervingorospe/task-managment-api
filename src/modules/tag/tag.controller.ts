import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { AddTagDto } from './dto/add-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @RequirePermissions({ allOf: [PERMISSIONS.TAG_VIEW] })
  @Get()
  tags(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.tagService.tags(orgId);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.TAG_ADD] })
  @Post()
  add(@Query('orgId', ParseIntPipe) orgId: number, @Body() dto: AddTagDto) {
    return this.tagService.add(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TAG_UPDATE],
    resource: 'tag.tagId',
  })
  @Patch(':tagId')
  update(
    @Param('tagId', ParseIntPipe) tagId: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagService.update(tagId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TAG_REMOVE],
    resource: 'tag.tagId',
  })
  @Delete(':tagId')
  remove(@Param('tagId', ParseIntPipe) tagId: number) {
    return this.tagService.remove(tagId);
  }
}
