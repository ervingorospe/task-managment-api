import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrgBasicInfoDto } from './dto/update-org-basic-info.dto';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';
import { UpdateOrgActiveStateDto } from './dto/update-org-active-state.dto';
import { RequestOwnershipTransferDto } from './dto/request-ownership-transfer.dto';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(dto);
  }

  // Static routes first — otherwise ':slug' below would swallow these.
  @Get('my-own-organizations')
  myOwnOrganizations(@Query('ownerId', ParseIntPipe) ownerId: number) {
    return this.organizationService.myOwnOrganizations(ownerId);
  }

  @Get('defaults/roles')
  defaultRoles() {
    return this.organizationService.defaultRoles();
  }

  @Get('defaults/tags')
  defaultTags() {
    return this.organizationService.defaultTags();
  }

  @Get('defaults/permissions')
  defaultPermissions() {
    return this.organizationService.defaultPermissions();
  }

  @Get('by-id/:orgId')
  organizationDetailsById(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.getDetailsById(orgId);
  }

  @Get(':slug')
  organizationDetails(@Param('slug') slug: string) {
    return this.organizationService.getDetailsBySlug(slug);
  }

  @Patch(':orgId/basic-info')
  updateBasicInfo(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgBasicInfoDto,
  ) {
    return this.organizationService.updateBasicInfo(orgId, dto);
  }

  @Patch(':orgId/settings')
  updateSettings(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgSettingsDto,
  ) {
    return this.organizationService.updateSettings(orgId, dto);
  }

  @Patch(':orgId/active-state')
  updateActiveState(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgActiveStateDto,
  ) {
    return this.organizationService.updateActiveState(orgId, dto);
  }

  // Unlike the rest of this controller's deletes (soft, returning the
  // updated row as a body), this one hard-deletes and returns nothing —
  // 204 tells the frontend not to try parsing a JSON body that isn't
  // there.
  @Delete(':orgId')
  @HttpCode(204)
  remove(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.remove(orgId);
  }

  @Post(':orgId/ownership-transfer')
  requestOwnershipTransfer(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: RequestOwnershipTransferDto,
  ) {
    return this.organizationService.requestOwnershipTransfer(orgId, dto);
  }

  @Delete(':orgId/ownership-transfer')
  cancelOwnershipTransfer(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.cancelOwnershipTransfer(orgId);
  }
}
