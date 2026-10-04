import { Test } from '@nestjs/testing';
import { MemberModule } from './member.module';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('MemberModule', () => {
  it('wires MemberController and MemberService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, MemberModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(MemberController)).toBeInstanceOf(MemberController);
    expect(moduleRef.get(MemberService)).toBeInstanceOf(MemberService);
  });
});
