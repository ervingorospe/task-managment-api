import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { createCircuitBreaker } from '../../common/helper/circuit-breaker.helper';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback — improves deliverability/spam scoring and
   * covers clients that don't render HTML. Optional since not every
   * caller will bother generating one. */
  text?: string;
}

/**
 * Nothing in this app sends real email yet — this is the reusable sending
 * capability, ready for whatever the first caller ends up being (e.g. a
 * member-invite email). Mirrors S3Service's shape: lazy client
 * construction so a missing/incomplete SES config only breaks the specific
 * request that tries to send mail, not the whole app at boot.
 */
@Injectable()
export class SesService {
  private readonly logger = new Logger(SesService.name);
  private readonly region = process.env.AWS_REGION ?? '';
  private readonly accessKeyId = process.env.AWS_SES_ACCESS_KEY ?? '';
  private readonly secretAccessKey =
    process.env.AWS_SES_SECRET_ACCESS_KEY ?? '';
  private readonly sender = process.env.AWS_SES_SENDER ?? '';
  private client: SESClient | null = null;

  // Repeated SES failures (sandbox restrictions, throttling, an outage)
  // shouldn't mean every caller pays a full timeout on every attempt —
  // once it's clearly down, this fails fast instead, and tests recovery
  // periodically. See circuit-breaker.helper.ts.
  private readonly breaker = createCircuitBreaker(
    'ses.send',
    (command: SendEmailCommand) => this.getClient().send(command),
  );

  async send({ to, subject, html, text }: SendEmailParams): Promise<void> {
    await this.breaker.fire(
      new SendEmailCommand({
        Source: this.sender,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
          },
        },
      }),
    );
  }

  private getClient(): SESClient {
    if (
      !this.region ||
      !this.accessKeyId ||
      !this.secretAccessKey ||
      !this.sender
    ) {
      throw new InternalServerErrorException(
        'SES is not configured — set AWS_REGION, AWS_SES_ACCESS_KEY, ' +
          'AWS_SES_SECRET_ACCESS_KEY, and AWS_SES_SENDER in .env (see .env.example).',
      );
    }
    this.client ??= new SESClient({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
    return this.client;
  }
}
