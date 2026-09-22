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

@Controller('members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  members(@Query() query: MembersQueryDto) {
    return this.memberService.members(query);
  }

  @Get('invites')
  invites(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.memberService.invites(orgId);
  }

  @Post('invite')
  invite(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: InviteMemberDto,
  ) {
    return this.memberService.invite(orgId, dto);
  }

  @Post('invites/:inviteId/resend')
  resend(@Param('inviteId', ParseIntPipe) inviteId: number) {
    return this.memberService.resend(inviteId);
  }

  @Delete('invites/:inviteId')
  removeInvite(@Param('inviteId', ParseIntPipe) inviteId: number) {
    return this.memberService.removeInvite(inviteId);
  }

  @Patch(':memberId/role')
  updateRole(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(memberId, dto);
  }

  @Patch(':memberId/active-state')
  updateActiveState(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberActiveStateDto,
  ) {
    return this.memberService.updateActiveState(memberId, dto);
  }

  @Delete(':memberId')
  @HttpCode(204)
  remove(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.memberService.remove(memberId);
  }
}
