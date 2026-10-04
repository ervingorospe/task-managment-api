import { Test } from '@nestjs/testing';
import { TicketModule } from './ticket.module';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('TicketModule', () => {
  it('wires TicketController and TicketService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, TicketModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(TicketController)).toBeInstanceOf(TicketController);
    expect(moduleRef.get(TicketService)).toBeInstanceOf(TicketService);
  });
});
