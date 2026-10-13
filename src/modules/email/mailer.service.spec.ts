import { InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  const originalEnv = { ...process.env };
  const sendMail = jest.fn().mockResolvedValue(undefined);
  let createTransportSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'relay.app@gmail.com';
    process.env.SMTP_PASSWORD = 'app-password';
    sendMail.mockClear();
    createTransportSpy = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    createTransportSpy.mockRestore();
  });

  it('sends with the configured sender and the given destination/subject/html', async () => {
    const service = new MailerService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'relay.app@gmail.com',
        to: 'jane@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      }),
    );
  });

  it('passes a plain-text fallback through when given', async () => {
    const service = new MailerService();
    await service.send({
      to: 'jane@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi' }),
    );
  });

  it('builds the transport with implicit TLS on port 465', async () => {
    const service = new MailerService();
    await service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' });

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'relay.app@gmail.com', pass: 'app-password' },
      }),
    );
  });

  it('upgrades via STARTTLS instead of implicit TLS on a non-465 port', async () => {
    process.env.SMTP_PORT = '587';
    const service = new MailerService();
    await service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' });

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('defaults to the Gmail host and port when unset', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    const service = new MailerService();
    await service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' });

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.gmail.com', port: 465 }),
    );
  });

  // Regression test: an env var that's *present but blank* (e.g.
  // `SMTP_HOST=` left unfilled in .env) is still a string, not
  // null/undefined — a ?? fallback never caught this and silently built
  // a transporter pointed at host '' / port 0, which just hung until the
  // circuit breaker timed out instead of failing clearly. Caught by
  // testing against a real Gmail account, not by the unset-only test
  // above.
  it('defaults to the Gmail host and port when present but blank', async () => {
    process.env.SMTP_HOST = '';
    process.env.SMTP_PORT = '';
    const service = new MailerService();
    await service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' });

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
      }),
    );
  });

  it('reuses the same transporter across multiple sends', async () => {
    const service = new MailerService();
    await service.send({ to: 'a@example.com', subject: 'Hi', html: '<p/>' });
    await service.send({ to: 'b@example.com', subject: 'Hi', html: '<p/>' });

    expect(createTransportSpy).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerErrorException when SMTP is not fully configured', async () => {
    delete process.env.SMTP_PASSWORD;
    const service = new MailerService();

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p/>' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
