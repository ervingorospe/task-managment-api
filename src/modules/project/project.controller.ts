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
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  // anyOf here only gates "can reach this endpoint at all" — which
  // projects actually come back (everything vs. just what they're
  // assigned to) is resolved server-side in the service, from the
  // caller's real rules, not a client-supplied flag.
  @RequirePermissions({
    anyOf: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_VIEW_OWN],
  })
  @Get()
  projects(
    @Query('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectService.projects(orgId, user.id);
  }

  @RequirePermissions({
    anyOf: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_VIEW_OWN],
    resource: 'project.projectId',
  })
  @Get(':projectId')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectService.findOne(projectId, user.id);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.PROJECT_ADD] })
  @Post()
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectService.create(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.PROJECT_UPDATE],
    resource: 'project.projectId',
  })
  @Patch(':projectId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(projectId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.PROJECT_REMOVE],
    resource: 'project.projectId',
  })
  @Delete(':projectId')
  remove(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectService.remove(projectId);
  }
}
