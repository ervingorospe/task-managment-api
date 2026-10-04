import { Test } from '@nestjs/testing';
import { OrganizationModule } from './organization.module';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('OrganizationModule', () => {
  it('wires OrganizationController and OrganizationService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, OrganizationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(OrganizationController)).toBeInstanceOf(
      OrganizationController,
    );
    expect(moduleRef.get(OrganizationService)).toBeInstanceOf(
      OrganizationService,
    );
  });
});
