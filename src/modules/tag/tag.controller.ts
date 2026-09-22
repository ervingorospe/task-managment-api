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

@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  tags(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.tagService.tags(orgId);
  }

  @Post()
  add(@Query('orgId', ParseIntPipe) orgId: number, @Body() dto: AddTagDto) {
    return this.tagService.add(orgId, dto);
  }

  @Patch(':tagId')
  update(
    @Param('tagId', ParseIntPipe) tagId: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagService.update(tagId, dto);
  }

  @Delete(':tagId')
  remove(@Param('tagId', ParseIntPipe) tagId: number) {
    return this.tagService.remove(tagId);
  }
}
