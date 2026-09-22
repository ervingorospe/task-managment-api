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

  // Email sending via SES (see modules/email/ses.service.ts) — optional
  // for the same reason: SesService builds its client lazily, so nothing
  // breaks at boot if these aren't set, only whatever eventually calls
  // SesService.send() without them configured.
  AWS_SES_ACCESS_KEY: Joi.string().allow('').optional(),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  AWS_SES_SENDER: Joi.string().allow('').optional(),

  // Base URL for links in outgoing emails (see member.service.ts's
  // invite()). Only validated here, not defaulted — this app reads
  // process.env directly rather than through ConfigService, so a Joi
  // .default() wouldn't actually reach that code; the fallback lives
  // where FRONTEND_URL is read instead.
  FRONTEND_URL: Joi.string().allow('').optional(),
});
