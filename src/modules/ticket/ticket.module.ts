import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';

@Module({
  imports: [StorageModule],
  controllers: [TicketController],
  providers: [TicketService],
})
export class TicketModule {}
