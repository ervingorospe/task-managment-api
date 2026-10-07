import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { TicketService } from './ticket.service';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { CountNumbersQueryDto } from './dto/count-numbers-query.dto';
import { AllTicketsQueryDto } from './dto/all-tickets-query.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateTicketTagDto } from './dto/update-ticket-tag.dto';
import { UpdateTicketAssigneesDto } from './dto/update-ticket-assignees.dto';
import { UpdateTicketStarDto } from './dto/update-ticket-star.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PersonalTicketQueryDto } from './dto/personal-ticket-query.dto';
import { PersonalCountNumbersQueryDto } from './dto/personal-count-numbers-query.dto';
import { CreatePersonalTicketDto } from './dto/create-personal-ticket.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

const CAN_VIEW_TICKETS = [
  PERMISSIONS.TICKET_VIEW_ALL,
  PERMISSIONS.TICKET_VIEW_INCLUDED,
];

// 10MB cap. Buffered in memory (not written to local disk) since
// TicketService.addAttachment() uploads the buffer straight to S3 — see
// storage/s3.service.ts. Filenames are randomized there so two uploads
// with the same original name never collide; the user-facing name is
// kept separately in the DB.
const attachmentUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // Static routes first — otherwise ':ticketId' below would swallow these.
  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS })
  @Get('count-numbers')
  countNumbers(
    @CurrentUser() user: RequestUser,
    @Query() query: CountNumbersQueryDto,
  ) {
    return this.ticketService.countNumbers(query, user.id);
  }

  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS })
  @Get('recent')
  recent(
    @CurrentUser() user: RequestUser,
    @Query('orgId', ParseIntPipe) orgId: number,
  ) {
    return this.ticketService.recent(orgId, user.id);
  }

  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS })
  @Get('all')
  all(@CurrentUser() user: RequestUser, @Query() query: AllTicketsQueryDto) {
    return this.ticketService.allForOrg(
      query.orgId,
      user.id,
      query.involvesUserId,
    );
  }

  // "personal" routes ahead of ':ticketId' for the same reason — a
  // ticket owned directly by a user (Personal mode), no org/role/rule
  // involved. Identity comes from the session, not a client-supplied
  // userId — otherwise any logged-in user could read/write anyone else's
  // personal tickets just by changing the query param.
  @Get('personal/count-numbers')
  countNumbersPersonal(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonalCountNumbersQueryDto,
  ) {
    return this.ticketService.countNumbersPersonal(user.id, query);
  }

  @Get('personal/all')
  allPersonal(@CurrentUser() user: RequestUser) {
    return this.ticketService.allForOwner(user.id);
  }

  @Get('personal')
  listPersonal(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonalTicketQueryDto,
  ) {
    return this.ticketService.listPersonal(user.id, query);
  }

  @Post('personal')
  createPersonal(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePersonalTicketDto,
  ) {
    return this.ticketService.createPersonal(user.id, dto);
  }

  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: TicketQueryDto) {
    return this.ticketService.list(query, user.id);
  }

  @RequirePermissions({ allOf: [PERMISSIONS.TICKET_CREATE] })
  @Post()
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketService.create(orgId, dto);
  }

  // :ticketId routes below serve both org tickets and personal tickets —
  // PermissionsGuard resolves which (see resolveTicketScope) and, for a
  // personal ticket, requires the caller to be its owner instead of
  // checking anyOf/allOf against an org role that doesn't apply to it.
  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS, resource: 'ticket.ticketId' })
  @Get(':ticketId')
  details(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.details(ticketId, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_UPDATE],
    resource: 'ticket.ticketId',
  })
  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.update(ticketId, dto, user.id);
  }

  // tagId doubles as "status" in this app — a separate Rule from the rest
  // of a ticket's fields (see ticket.service.ts's updateTag() comment).
  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_CHANGE_TAG],
    resource: 'ticket.ticketId',
  })
  @Patch(':ticketId/tag')
  updateTag(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketTagDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.updateTag(ticketId, dto, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_ASSIGN],
    resource: 'ticket.ticketId',
  })
  @Patch(':ticketId/assignees')
  updateAssignees(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketAssigneesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.updateAssignees(ticketId, dto, user.id);
  }

  // Starring is a personal bookmark, not an edit — anyone who can view the
  // ticket can star/unstar it for themselves, no ticket.update needed.
  @RequirePermissions({ anyOf: CAN_VIEW_TICKETS, resource: 'ticket.ticketId' })
  @Patch(':ticketId/star')
  updateStar(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketStarDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.updateStar(ticketId, dto, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_REMOVE],
    resource: 'ticket.ticketId',
  })
  @Delete(':ticketId')
  remove(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketService.remove(ticketId);
  }

  // File uploads are heavier (disk I/O, up to 10MB each) than a typical
  // request, so they get a tighter limit than the app-wide default.
  // ticket.update = "title, description, and attachments" per this app's
  // rule definitions — attachments aren't their own permission.
  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_UPDATE],
    resource: 'ticket.ticketId',
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':ticketId/attachments')
  @UseInterceptors(attachmentUpload)
  addAttachment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.ticketService.addAttachment(ticketId, file);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_UPDATE],
    resource: 'ticketAttachment.attachmentId',
  })
  @Delete(':ticketId/attachments/:attachmentId')
  removeAttachment(@Param('attachmentId', ParseIntPipe) attachmentId: number) {
    return this.ticketService.removeAttachment(attachmentId);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_COMMENT],
    resource: 'ticket.ticketId',
  })
  @Post(':ticketId/comments')
  addComment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @CurrentUser() user: RequestUser,
    @Body() dto: AddCommentDto,
  ) {
    return this.ticketService.addComment(ticketId, user.id, dto);
  }

  // ticket.edit.comment only gates *whether* you can edit comments at
  // all — TicketService.updateComment() enforces the actual "only your
  // own, no exceptions" rule, since no Rule can express that part.
  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_EDIT_COMMENT],
    resource: 'ticketComment.commentId',
  })
  @Patch('comments/:commentId')
  updateComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.ticketService.updateComment(commentId, user.id, dto);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.TICKET_REMOVE_COMMENT],
    resource: 'ticketComment.commentId',
  })
  @Delete('comments/:commentId')
  removeComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketService.removeComment(commentId, user.id);
  }
}
