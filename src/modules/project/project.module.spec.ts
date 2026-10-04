import { Test } from '@nestjs/testing';
import { ProjectModule } from './project.module';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { createMockPrisma } from '../../test/mock-prisma';

describe('ProjectModule', () => {
  it('wires ProjectController and ProjectService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, PermissionsModule, ProjectModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(ProjectController)).toBeInstanceOf(ProjectController);
    expect(moduleRef.get(ProjectService)).toBeInstanceOf(ProjectService);
  });
});
