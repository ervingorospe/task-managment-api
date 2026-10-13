import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
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
 * Sends mail over SMTP (e.g. Gmail with an App Password) rather than a
 * provider API like SES — no domain verification or production-access
 * review needed, just a mailbox and an app password. Mirrors S3Service's
 * shape: lazy client construction so a missing/incomplete SMTP config
 * only breaks the specific request that tries to send mail, not the
 * whole app at boot.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  // || not ?? deliberately: an env var that's *present but blank* (e.g.
  // `SMTP_HOST=` left unfilled in .env) is still a string, so ?? would
  // never fall back to the default — it only treats null/undefined as
  // "missing," not ''. That silently pointed the transporter at host ''
  // / port 0 instead of Gmail, which just hangs until the circuit
  // breaker times out rather than failing with a clear error.
  private readonly host = process.env.SMTP_HOST || 'smtp.gmail.com';
  private readonly port = Number(process.env.SMTP_PORT) || 465;
  private readonly user = process.env.SMTP_USER ?? '';
  private readonly password = process.env.SMTP_PASSWORD ?? '';
  private transporter: Transporter | null = null;

  // Repeated SMTP failures (bad credentials, the provider throttling us,
  // an outage) shouldn't mean every caller pays a full timeout on every
  // attempt — once it's clearly down, this fails fast instead, and tests
  // recovery periodically. See circuit-breaker.helper.ts. timeout is
  // raised from the 5s default — that's tuned for a single HTTPS API
  // call (SES), but a full SMTP round trip (TCP connect + TLS + AUTH +
  // DATA) genuinely takes longer, especially on the first connection
  // before anything is pooled; 5s was tripping on real, successful sends.
  private readonly breaker = createCircuitBreaker(
    'mailer.send',
    (params: SendEmailParams) => this.sendNow(params),
    { timeout: 15000 },
  );

  async send(params: SendEmailParams): Promise<void> {
    await this.breaker.fire(params);
  }

  private async sendNow({ to, subject, html, text }: SendEmailParams) {
    await this.getTransporter().sendMail({
      from: this.user,
      to,
      subject,
      html,
      text,
    });
  }

  private getTransporter(): Transporter {
    if (!this.user || !this.password) {
      throw new InternalServerErrorException(
        'SMTP is not configured — set SMTP_USER and SMTP_PASSWORD in .env ' +
          '(see .env.example). SMTP_HOST/SMTP_PORT default to Gmail.',
      );
    }
    this.transporter ??= createTransport({
      host: this.host,
      port: this.port,
      // 465 is the implicit-TLS port (connect already encrypted); every
      // other port (e.g. Gmail's 587) upgrades via STARTTLS instead.
      secure: this.port === 465,
      auth: { user: this.user, pass: this.password },
    });
    return this.transporter;
  }
}
