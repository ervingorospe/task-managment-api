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
import { UpdateRequestDto } from './dto/update-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

// No explicit "view" rule exists for requests — holding any request.*
// permission (own or all tier) is enough to hit the list/detail routes;
// the own/all split only governs which requests you can *act on*
// (create/cancel/update — enforced in the service, since the route can't
// see a request's clientId to know whether it's "yours").
const CAN_VIEW_REQUESTS = [
  PERMISSIONS.REQUEST_ALL_CREATE,
  PERMISSIONS.REQUEST_ALL_CANCEL,
  PERMISSIONS.REQUEST_ALL_APPROVE,
  PERMISSIONS.REQUEST_ALL_REJECT,
  PERMISSIONS.REQUEST_ALL_UPDATE,
  PERMISSIONS.REQUEST_OWN_CREATE,
  PERMISSIONS.REQUEST_OWN_CANCEL,
  PERMISSIONS.REQUEST_OWN_UPDATE,
];

@Controller('ticket-requests')
export class TicketRequestController {
  constructor(private readonly ticketRequestService: TicketRequestService) {}

  @RequirePermissions({ anyOf: CAN_VIEW_REQUESTS })
  @Get()
  list(@Query() query: RequestQueryDto) {
    return this.ticketRequestService.list(query);
  }

  // Static route — must stay before ':requestId' below, which would
  // otherwise swallow "/ticket-requests/all" and 400 on ParseIntPipe.
  @RequirePermissions({ anyOf: CAN_VIEW_REQUESTS })
  @Get('all')
  all(@Query() query: AllRequestsQueryDto) {
    return this.ticketRequestService.allForOrg(
      query.orgId,
      query.involvesUserId,
    );
  }

  @RequirePermissions({
    anyOf: [PERMISSIONS.REQUEST_OWN_CREATE, PERMISSIONS.REQUEST_ALL_CREATE],
  })
  @Post()
  create(
    @Query('orgId', ParseIntPipe) orgId: number,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateRequestDto,
  ) {
    return this.ticketRequestService.create(orgId, user.id, dto);
  }

  @RequirePermissions({
    anyOf: CAN_VIEW_REQUESTS,
    resource: 'ticketRequest.requestId',
  })
  @Get(':requestId')
  details(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.ticketRequestService.details(requestId);
  }

  @RequirePermissions({
    anyOf: [PERMISSIONS.REQUEST_OWN_UPDATE, PERMISSIONS.REQUEST_ALL_UPDATE],
    resource: 'ticketRequest.requestId',
  })
  @Patch(':requestId')
  update(
    @Param('requestId', ParseIntPipe) requestId: number,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.ticketRequestService.update(requestId, user.id, dto);
  }

  // Reviewing a request (reject/approve) is a triage action — always the
  // "all" tier, there's no "approve your own request" concept.
  @RequirePermissions({
    allOf: [PERMISSIONS.REQUEST_ALL_REJECT],
    resource: 'ticketRequest.requestId',
  })
  @Patch(':requestId/reject')
  reject(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: RejectRequestDto,
  ) {
    return this.ticketRequestService.reject(requestId, dto);
  }

  @RequirePermissions({
    anyOf: [PERMISSIONS.REQUEST_OWN_CANCEL, PERMISSIONS.REQUEST_ALL_CANCEL],
    resource: 'ticketRequest.requestId',
  })
  @Patch(':requestId/cancel')
  cancel(
    @Param('requestId', ParseIntPipe) requestId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketRequestService.cancel(requestId, user.id);
  }

  @RequirePermissions({
    allOf: [PERMISSIONS.REQUEST_ALL_APPROVE],
    resource: 'ticketRequest.requestId',
  })
  @Post(':requestId/approve')
  approve(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ApproveRequestDto,
  ) {
    return this.ticketRequestService.approve(requestId, dto);
  }
}
