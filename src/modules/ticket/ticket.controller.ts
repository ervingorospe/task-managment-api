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
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { TicketService } from './ticket.service';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { CountNumbersQueryDto } from './dto/count-numbers-query.dto';
import { AllTicketsQueryDto } from './dto/all-tickets-query.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

// 10MB cap and disk storage under ./uploads (served back by main.ts's
// useStaticAssets) — this project has no S3/cloud storage set up, so local
// disk is the whole story. Filenames are randomized on write so two
// uploads with the same original name never collide or overwrite; the
// user-facing name is kept separately in the DB (see addAttachment).
const attachmentUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: './uploads',
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // Static routes first — otherwise ':ticketId' below would swallow these.
  @Get('count-numbers')
  countNumbers(@Query() query: CountNumbersQueryDto) {
    return this.ticketService.countNumbers(query);
  }

  @Get('recent')
  recent(@Query('orgId', ParseIntPipe) orgId: number) {
    return this.ticketService.recent(orgId);
  }

  @Get('all')
  all(@Query() query: AllTicketsQueryDto) {
    return this.ticketService.allForOrg(query.orgId, query.involvesUserId);
  }

  @Get()
  list(@Query() query: TicketQueryDto) {
    return this.ticketService.list(query);
  }

  @Post()
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketService.create(orgId, dto);
  }

  @Get(':ticketId')
  details(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketService.details(ticketId);
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketService.update(ticketId, dto);
  }

  @Delete(':ticketId')
  remove(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketService.remove(ticketId);
  }

  @Post(':ticketId/attachments')
  @UseInterceptors(attachmentUpload)
  addAttachment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.ticketService.addAttachment(ticketId, file);
  }

  @Delete(':ticketId/attachments/:attachmentId')
  removeAttachment(
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.ticketService.removeAttachment(attachmentId);
  }

  @Post(':ticketId/comments')
  addComment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddCommentDto,
  ) {
    return this.ticketService.addComment(ticketId, dto);
  }

  @Patch('comments/:commentId')
  updateComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.ticketService.updateComment(commentId, dto);
  }

  @Delete('comments/:commentId')
  removeComment(@Param('commentId', ParseIntPipe) commentId: number) {
    return this.ticketService.removeComment(commentId);
  }
}
