process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET ??= 'test-secret';
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL ??=
  'https://api.example.com/auth/google/callback';

import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { OrganizationController } from './modules/organization/organization.controller';
import { createMockPrisma } from './test/mock-prisma';

describe('AppModule', () => {
  it('wires the full app graph — every feature module, guard, and interceptor', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrisma())
      .compile();

    expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
    expect(moduleRef.get(AppService)).toBeInstanceOf(AppService);
    // Confirms at least one leaf feature module resolved correctly too —
    // a broken import anywhere in the chain would fail .compile() above.
    expect(moduleRef.get(OrganizationController)).toBeInstanceOf(
      OrganizationController,
    );
  });
});
