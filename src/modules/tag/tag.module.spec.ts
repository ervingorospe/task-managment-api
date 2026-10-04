import { Test } from '@nestjs/testing';
import { TagModule } from './tag.module';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('TagModule', () => {
  it('wires TagController and TagService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, TagModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(TagController)).toBeInstanceOf(TagController);
    expect(moduleRef.get(TagService)).toBeInstanceOf(TagService);
  });
});
