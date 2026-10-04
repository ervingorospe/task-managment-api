import { Test } from '@nestjs/testing';
import { TicketRequestModule } from './ticket-request.module';
import { TicketRequestController } from './ticket-request.controller';
import { TicketRequestService } from './ticket-request.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { createMockPrisma } from '../../test/mock-prisma';

describe('TicketRequestModule', () => {
  it('wires TicketRequestController and TicketRequestService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, PermissionsModule, TicketRequestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(TicketRequestController)).toBeInstanceOf(
      TicketRequestController,
    );
    expect(moduleRef.get(TicketRequestService)).toBeInstanceOf(
      TicketRequestService,
    );
  });
});
