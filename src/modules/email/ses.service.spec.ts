import { InternalServerErrorException } from '@nestjs/common';
import { SESClient } from '@aws-sdk/client-ses';
import { SesService } from './ses.service';

describe('SesService', () => {
  const originalEnv = { ...process.env };
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_SES_ACCESS_KEY = 'key';
    process.env.AWS_SES_SECRET_ACCESS_KEY = 'secret';
    process.env.AWS_SES_SENDER = 'noreply@example.com';
    sendSpy = jest
      .spyOn(SESClient.prototype, 'send')
      .mockResolvedValue({} as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    sendSpy.mockRestore();
  });

  it('sends with the configured sender and the given destination/subject/html', async () => {
    const service = new SesService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [command] = sendSpy.mock.calls[0];
    expect(command.input).toEqual(
      expect.objectContaining({
        Source: 'noreply@example.com',
        Destination: { ToAddresses: ['jane@example.com'] },
      }),
    );
  });

  it('includes a plain-text body when text is given', async () => {
    const service = new SesService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    const [command] = sendSpy.mock.calls[0];
    expect(command.input.Message.Body.Text).toEqual({
      Data: 'Hi',
      Charset: 'UTF-8',
    });
  });

  it('omits the Text body entirely when no plain-text fallback is given', async () => {
    const service = new SesService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    const [command] = sendSpy.mock.calls[0];
    expect(command.input.Message.Body.Text).toBeUndefined();
  });

  it('throws InternalServerErrorException when SES is not fully configured', async () => {
    delete process.env.AWS_SES_SENDER;
    const service = new SesService();

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
