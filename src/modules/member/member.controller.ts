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
import { MemberService } from './member.service';
import { MembersQueryDto } from './dto/members-query.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateMemberActiveStateDto } from './dto/update-member-active-state.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

@Controller('members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @RequirePermissions({
    anyOf: [
      PERMISSIONS.MEMBER_VIEW_MEMBERS,
      PERMISSIONS.MEMBER_VIEW_OWNER,
      PERMISSIONS.MEMBER_VIEW_CLIENT,
    ],
  })
  @Get()
  members(@Query() query: MembersQueryDto) {
    return this.memberService.members(query);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.MEMBER_INVITE] })
  @Get('invites')
  invites(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.memberService.invites(orgId);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.MEMBER_INVITE] })
  @Post('invite')
  invite(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.memberService.invite(orgId, dto, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.MEMBER_INVITE],
    resource: 'memberInvite.inviteId',
  })
  @Post('invites/:inviteId/resend')
  resend(
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.memberService.resend(inviteId, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.MEMBER_INVITE],
    resource: 'memberInvite.inviteId',
  })
  @Delete('invites/:inviteId')
  removeInvite(@Param('inviteId', ParseIntPipe) inviteId: number) {
    return this.memberService.removeInvite(inviteId);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.MEMBER_UPDATE_ROLE],
    resource: 'member.memberId',
  })
  @Patch(':memberId/role')
  updateRole(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(memberId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.MEMBER_SET_ACTIVE],
    resource: 'member.memberId',
  })
  @Patch(':memberId/active-state')
  updateActiveState(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberActiveStateDto,
  ) {
    return this.memberService.updateActiveState(memberId, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.MEMBER_REMOVE],
    resource: 'member.memberId',
  })
  @Delete(':memberId')
  @HttpCode(204)
  remove(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.memberService.remove(memberId);
  }
}
