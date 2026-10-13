import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import sgMail from '@sendgrid/mail';
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
 * Sends mail via SendGrid's HTTPS API — not raw SMTP. Render's free tier
 * blocks outbound traffic to SMTP ports (25/465/587) entirely, which is
 * what this replaced a Gmail-SMTP MailerService for; a plain HTTPS POST
 * to SendGrid isn't affected by that block at all. No domain needed
 * either — a Single Sender Verification (just the SENDGRID_SENDER
 * address) is enough to send to any recipient. Mirrors S3Service's
 * shape: lazy client configuration so a missing API key only breaks the
 * specific request that tries to send mail, not the whole app at boot.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly apiKey = process.env.SENDGRID_API_KEY || '';
  private readonly sender = process.env.SENDGRID_SENDER || '';
  private configured = false;

  // Repeated SendGrid failures (bad API key, the provider throttling us,
  // an outage) shouldn't mean every caller pays a full timeout on every
  // attempt — once it's clearly down, this fails fast instead, and tests
  // recovery periodically. See circuit-breaker.helper.ts.
  private readonly breaker = createCircuitBreaker(
    'mailer.send',
    (params: SendEmailParams) => this.sendNow(params),
  );

  async send(params: SendEmailParams): Promise<void> {
    await this.breaker.fire(params);
  }

  private async sendNow({ to, subject, html, text }: SendEmailParams) {
    this.ensureConfigured();
    await sgMail.send({
      to,
      from: this.sender,
      subject,
      html,
      ...(text ? { text } : {}),
    });
  }

  private ensureConfigured(): void {
    if (!this.apiKey || !this.sender) {
      throw new InternalServerErrorException(
        'SendGrid is not configured — set SENDGRID_API_KEY and ' +
          'SENDGRID_SENDER in .env (see .env.example).',
      );
    }
    // setApiKey is cheap and idempotent, but only call it once the key is
    // confirmed present — calling it with an empty string at module load
    // would throw before the clearer error above ever runs.
    if (!this.configured) {
      sgMail.setApiKey(this.apiKey);
      this.configured = true;
    }
  }
}
