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

@Controller()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('roles/categories')
  categories() {
    return this.roleService.categories();
  }

  @Get('roles')
  roles(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.roleService.roles(orgId);
  }

  @Post('roles')
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roleService.create(orgId, dto);
  }

  @Patch('roles/:roleId/rules')
  updateRules(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleRulesDto,
  ) {
    return this.roleService.updateRules(roleId, dto);
  }

  @Patch('roles/:roleId')
  updateInfo(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleInfoDto,
  ) {
    return this.roleService.updateInfo(roleId, dto);
  }

  @Delete('roles/:roleId')
  remove(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.roleService.remove(roleId);
  }
}
