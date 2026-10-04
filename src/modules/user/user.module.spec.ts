import { Test } from '@nestjs/testing';
import { UserModule } from './user.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('UserModule', () => {
  it('wires UserController and UserService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, UserModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(UserController)).toBeInstanceOf(UserController);
    expect(moduleRef.get(UserService)).toBeInstanceOf(UserService);
  });
});
