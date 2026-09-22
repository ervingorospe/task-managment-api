import { Module } from '@nestjs/common';
import { TicketRequestController } from './ticket-request.controller';
import { TicketRequestService } from './ticket-request.service';

@Module({
  controllers: [TicketRequestController],
  providers: [TicketRequestService],
})
export class TicketRequestModule {}
