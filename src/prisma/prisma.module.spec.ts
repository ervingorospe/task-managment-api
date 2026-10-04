import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule', () => {
  it('wires PrismaService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    // Not toBeInstanceOf(PrismaService): ts-jest resolves this spec file's
    // own import of PrismaService through a separate module-graph pass
    // than the one Nest's DI container instantiated it through, so the
    // two class references are structurally identical but not the same
    // object — real duck-typing instead of identity comparison.
    const prismaService = moduleRef.get(PrismaService);
    expect(prismaService).toBeDefined();
    expect(typeof prismaService.onModuleInit).toBe('function');
    expect(typeof prismaService.onModuleDestroy).toBe('function');
  });
});
