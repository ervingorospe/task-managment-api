import { Test } from '@nestjs/testing';
import { ActivityLogModule } from './activity-log.module';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { NotificationEventsService } from './notification-events.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('ActivityLogModule', () => {
  it('wires ActivityLogController, ActivityLogService, and NotificationEventsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ActivityLogModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(ActivityLogController)).toBeInstanceOf(
      ActivityLogController,
    );
    expect(moduleRef.get(ActivityLogService)).toBeInstanceOf(
      ActivityLogService,
    );
    expect(moduleRef.get(NotificationEventsService)).toBeInstanceOf(
      NotificationEventsService,
    );
  });
});
