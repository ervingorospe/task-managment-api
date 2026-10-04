import { plainToInstance } from 'class-transformer';
import { CreateTicketDto } from './create-ticket.dto';

describe('CreateTicketDto', () => {
  it('coerces assigneeIds to numbers and transforms attachments', () => {
    const instance = plainToInstance(CreateTicketDto, {
      title: 'Bug',
      tagId: 1,
      assigneeIds: ['2', '3'],
      attachments: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
    });
    expect(instance.assigneeIds).toEqual([2, 3]);
    expect(instance.attachments?.[0].name).toBe('a.png');
  });
});
