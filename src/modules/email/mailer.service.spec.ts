import { InternalServerErrorException } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  const originalEnv = { ...process.env };
  let sendSpy: jest.SpyInstance;
  let setApiKeySpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.SENDGRID_API_KEY = 'SG.test-key';
    process.env.SENDGRID_SENDER = 'relay.app@gmail.com';
    sendSpy = jest.spyOn(sgMail, 'send').mockResolvedValue(undefined as never);
    setApiKeySpy = jest.spyOn(sgMail, 'setApiKey').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    sendSpy.mockRestore();
    setApiKeySpy.mockRestore();
  });

  it('sends with the configured sender and the given destination/subject/html', async () => {
    const service = new MailerService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'relay.app@gmail.com',
        to: 'jane@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      }),
    );
  });

  it('includes a plain-text body when text is given', async () => {
    const service = new MailerService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi' }),
    );
  });

  it('omits the text field entirely when no plain-text fallback is given', async () => {
    const service = new MailerService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    const [arg] = sendSpy.mock.calls[0];
    expect(arg).not.toHaveProperty('text');
  });

  it('sets the API key once, even across multiple sends', async () => {
    const service = new MailerService();
    await service.send({ to: 'a@example.com', subject: 'Hi', html: '<p/>' });
    await service.send({ to: 'b@example.com', subject: 'Hi', html: '<p/>' });

    expect(setApiKeySpy).toHaveBeenCalledTimes(1);
    expect(setApiKeySpy).toHaveBeenCalledWith('SG.test-key');
  });

  it('throws InternalServerErrorException when SENDGRID_API_KEY is missing', async () => {
    delete process.env.SENDGRID_API_KEY;
    const service = new MailerService();

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('throws InternalServerErrorException when SENDGRID_SENDER is missing', async () => {
    delete process.env.SENDGRID_SENDER;
    const service = new MailerService();

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('throws InternalServerErrorException when both are present but blank', async () => {
    process.env.SENDGRID_API_KEY = '';
    process.env.SENDGRID_SENDER = '';
    const service = new MailerService();

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
