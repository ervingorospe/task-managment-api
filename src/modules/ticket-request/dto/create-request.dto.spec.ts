import { plainToInstance } from 'class-transformer';
import { CreateRequestDto } from './create-request.dto';

describe('CreateRequestDto', () => {
  it('transforms attachments into nested AttachmentDto instances', () => {
    const instance = plainToInstance(CreateRequestDto, {
      clientId: 1,
      title: 'Need help',
      attachments: [{ name: 'a.png', url: 'https://x/a.png', size: 1 }],
    });
    expect(instance.attachments?.[0].name).toBe('a.png');
  });
});
