process.env.JWT_SECRET ??= 'test-secret';
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL ??=
  'https://api.example.com/auth/google/callback';

import { Test } from '@nestjs/testing';
import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma } from '../../test/mock-prisma';

describe('AuthModule', () => {
  it('wires AuthController and AuthService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
  });
});
