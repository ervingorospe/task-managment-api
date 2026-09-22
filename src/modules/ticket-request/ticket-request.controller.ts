import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TicketRequestService } from './ticket-request.service';
import { RequestQueryDto } from './dto/request-query.dto';
import { AllRequestsQueryDto } from './dto/all-requests-query.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';

@Controller('ticket-requests')
export class TicketRequestController {
  constructor(private readonly ticketRequestService: TicketRequestService) {}

  @Get()
  list(@Query() query: RequestQueryDto) {
    return this.ticketRequestService.list(query);
  }

  // Static route — must stay before ':requestId' below, which would
  // otherwise swallow "/ticket-requests/all" and 400 on ParseIntPipe.
  @Get('all')
  all(@Query() query: AllRequestsQueryDto) {
    return this.ticketRequestService.allForOrg(
      query.orgId,
      query.involvesUserId,
    );
  }

  @Post()
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateRequestDto,
  ) {
    return this.ticketRequestService.create(orgId, dto);
  }

  @Get(':requestId')
  details(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.ticketRequestService.details(requestId);
  }

  @Patch(':requestId/reject')
  reject(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: RejectRequestDto,
  ) {
    return this.ticketRequestService.reject(requestId, dto);
  }

  @Patch(':requestId/cancel')
  cancel(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.ticketRequestService.cancel(requestId);
  }

  @Post(':requestId/approve')
  approve(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ApproveRequestDto,
  ) {
    return this.ticketRequestService.approve(requestId, dto);
  }
}
