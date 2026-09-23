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
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleRulesDto } from './dto/update-role-rules.dto';
import { UpdateRoleInfoDto } from './dto/update-role-info.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

@Controller()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  // Global reference data (rule categories), not org-scoped.
  @Get('roles/categories')
  categories() {
    return this.roleService.categories();
  }

  @RequirePermissions({ allOf: [PERMISSIONS.ROLE_VIEW] })
  @Get('roles')
  roles(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.roleService.roles(orgId);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.ROLE_ADD] })
  @Post('roles')
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roleService.create(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ROLE_UPDATE],
    resource: 'role.roleId',
  })
  @Patch('roles/:roleId/rules')
  updateRules(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleRulesDto,
  ) {
    return this.roleService.updateRules(roleId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ROLE_UPDATE],
    resource: 'role.roleId',
  })
  @Patch('roles/:roleId')
  updateInfo(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleInfoDto,
  ) {
    return this.roleService.updateInfo(roleId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ROLE_REMOVE],
    resource: 'role.roleId',
  })
  @Delete('roles/:roleId')
  remove(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.roleService.remove(roleId);
  }
}
