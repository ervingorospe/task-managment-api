import Joi from 'joi';

/**
 * Validated once at boot by ConfigModule.forRoot() (see app.module.ts) —
 * a bad or missing env var fails loudly with a clear message naming the
 * variable, instead of the app booting fine and only breaking later, the
 * first time that specific code path runs (exactly what happened with
 * S3Service before this existed: it booted with no AWS_REGION set, then
 * threw a raw AWS SDK stack trace the moment someone tried to upload).
 */
export const configValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  PORT: Joi.number().integer().default(3001),

  // S3 attachment storage (see modules/storage/s3.service.ts). Optional
  // on purpose: S3Service builds its client lazily and only fails the
  // specific upload/remove-attachment request when these are missing —
  // the rest of the app works fine without them, so a missing AWS setup
  // shouldn't stop the whole service from booting. .allow('') because an
  // env var that's *present but blank* (e.g. `AWS_S3_BUCKET=` in .env,
  // left unfilled) still fails plain .optional() — Joi only treats an
  // absent key as "not there," not an empty string.
  AWS_REGION: Joi.string().allow('').optional(),
  AWS_S3_BUCKET: Joi.string().allow('').optional(),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),

  // Email sending via SMTP (see modules/email/mailer.service.ts) —
  // optional for the same reason: MailerService builds its transporter
  // lazily, so nothing breaks at boot if these aren't set, only whatever
  // eventually calls MailerService.send() without them configured.
  // SMTP_HOST/SMTP_PORT default to Gmail (smtp.gmail.com:465) in the
  // service itself, so they're not required here.
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.string().allow('').optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),

  // Base URL for links in outgoing emails (see member.service.ts's
  // invite()). Only validated here, not defaulted — this app reads
  // process.env directly rather than through ConfigService, so a Joi
  // .default() wouldn't actually reach that code; the fallback lives
  // where FRONTEND_URL is read instead.
  FRONTEND_URL: Joi.string().allow('').optional(),

  // Auth (see modules/auth/). Required, not optional like S3/SES — the
  // app has no working login at all without these, unlike attachments or
  // outgoing mail, which degrade gracefully on their own.
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  // Backend's own public URL — used to build the verify-email link (which
  // must point at this backend's /auth/verify-email, not the frontend).
  // Same read-process.env.directly pattern as FRONTEND_URL, so not
  // defaulted here either.
  BACKEND_URL: Joi.string().allow('').optional(),
});
