import { Test } from '@nestjs/testing';
import { EmailModule } from './email.module';
import { MailerService } from './mailer.service';

describe('EmailModule', () => {
  it('wires MailerService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmailModule],
    }).compile();

    expect(moduleRef.get(MailerService)).toBeInstanceOf(MailerService);
  });
});
