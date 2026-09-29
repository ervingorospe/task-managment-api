import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OrganizationService } from './organization.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrgBasicInfoDto } from './dto/update-org-basic-info.dto';
import { UpdateOrgTimezoneDto } from './dto/update-org-timezone.dto';
import { UpdateOrgInviteExpirationDto } from './dto/update-org-invite-expiration.dto';
import { UpdateOrgNotificationsDto } from './dto/update-org-notifications.dto';
import { UpdateOrgActiveStateDto } from './dto/update-org-active-state.dto';
import { RequestOwnershipTransferDto } from './dto/request-ownership-transfer.dto';

// 5MB cap — logos are small images, not general attachments. Buffered in
// memory and uploaded to S3 (see storage/s3.service.ts), same as ticket
// attachments.
const logoUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // ownerId comes from the session, not the body — a client-supplied
  // ownerId would let anyone create an organization "owned by" any user
  // id they choose. No permission gate beyond "logged in" — creating an
  // org is how someone becomes a member of anything in the first place,
  // so it can't itself depend on already holding a rule somewhere. The one
  // exception: an account that only exists because it accepted an invite
  // (never signed up on its own) can never create an organization either.
  @Post()
  createOrganization(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.createdViaInvite) {
      throw new ForbiddenException(
        'An account created from an invite cannot create an organization.',
      );
    }
    return this.organizationService.create(dto, user.id);
  }

  // Static routes first — otherwise ':slug' below would swallow these.
  // ownerId comes from the session now, not the query — a client-supplied
  // one would let any logged-in user list another user's organizations.
  @Get('my-own-organizations')
  myOwnOrganizations(@CurrentUser() user: RequestUser) {
    return this.organizationService.myOwnOrganizations(user.id);
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

  // View access is membership-only — no specific Rule for "can see your
  // own org's basic info", every active member of it can.
  @RequirePermissions({ resource: 'param.orgId' })
  @Get('by-id/:orgId')
  organizationDetailsById(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.getDetailsById(orgId);
  }

  @RequirePermissions({ resource: 'param.slug' })
  @Get(':slug')
  organizationDetails(@Param('slug') slug: string) {
    return this.organizationService.getDetailsBySlug(slug);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_UPDATE_BASIC_INFO],
    resource: 'param.orgId',
  })
  @Patch(':orgId/basic-info')
  updateBasicInfo(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgBasicInfoDto,
  ) {
    return this.organizationService.updateBasicInfo(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_UPDATE_LOGO],
    resource: 'param.orgId',
  })
  @Post(':orgId/logo')
  @UseInterceptors(logoUpload)
  uploadLogo(
    @Param('orgId', ParseIntPipe) orgId: number,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.organizationService.uploadLogo(orgId, file);
  }

  // Settings used to be one combined PATCH — split into one route per
  // field so each can carry its own Rule (a role might be trusted to
  // change the timezone but not the invite policy, etc.).
  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_UPDATE_TIMEZONE],
    resource: 'param.orgId',
  })
  @Patch(':orgId/settings/timezone')
  updateTimezone(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgTimezoneDto,
  ) {
    return this.organizationService.updateTimezone(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_UPDATE_INVITE_EXPIRATION],
    resource: 'param.orgId',
  })
  @Patch(':orgId/settings/invite-expiration')
  updateInviteExpiration(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgInviteExpirationDto,
  ) {
    return this.organizationService.updateInviteExpiration(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_UPDATE_NOTIFICATIONS],
    resource: 'param.orgId',
  })
  @Patch(':orgId/settings/notifications')
  updateNotifications(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: UpdateOrgNotificationsDto,
  ) {
    return this.organizationService.updateNotifications(orgId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_DEACTIVATE],
    resource: 'param.orgId',
  })
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
  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_DELETE],
    resource: 'param.orgId',
  })
  @Delete(':orgId')
  @HttpCode(204)
  remove(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.remove(orgId);
  }

  // Default seeding gives this rule to Superadmin only — see prisma/seed.ts.
  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_CHANGE_OWNERSHIP],
    resource: 'param.orgId',
  })
  @Post(':orgId/ownership-transfer')
  requestOwnershipTransfer(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: RequestOwnershipTransferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizationService.requestOwnershipTransfer(
      orgId,
      dto,
      user.id,
    );
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.ORGANIZATION_CHANGE_OWNERSHIP],
    resource: 'param.orgId',
  })
  @Delete(':orgId/ownership-transfer')
  cancelOwnershipTransfer(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.organizationService.cancelOwnershipTransfer(orgId);
  }
}
