import { Test } from '@nestjs/testing';
import { RoleModule } from './role.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('RoleModule', () => {
  it('wires RoleController and RoleService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, RoleModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(RoleController)).toBeInstanceOf(RoleController);
    expect(moduleRef.get(RoleService)).toBeInstanceOf(RoleService);
  });
});
