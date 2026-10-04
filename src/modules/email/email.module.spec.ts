import { Test } from '@nestjs/testing';
import { EmailModule } from './email.module';
import { SesService } from './ses.service';

describe('EmailModule', () => {
  it('wires SesService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmailModule],
    }).compile();

    expect(moduleRef.get(SesService)).toBeInstanceOf(SesService);
  });
});
