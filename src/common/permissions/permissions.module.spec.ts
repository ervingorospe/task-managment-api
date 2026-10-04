import { Test } from '@nestjs/testing';
import { PermissionsModule } from './permissions.module';
import { PermissionsService } from './permissions.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('PermissionsModule', () => {
  it('wires PermissionsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, PermissionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(PermissionsService)).toBeInstanceOf(
      PermissionsService,
    );
  });
});
