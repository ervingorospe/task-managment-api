import { plainToInstance } from 'class-transformer';
import { CreatePersonalTicketDto } from './create-personal-ticket.dto';

describe('CreatePersonalTicketDto', () => {
  it('transforms attachments into nested AttachmentDto instances', () => {
    const instance = plainToInstance(CreatePersonalTicketDto, {
      title: 'Task',
      tagId: 1,
      attachments: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
    });
    expect(instance.attachments?.[0].name).toBe('a.png');
  });
});
