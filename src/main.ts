import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every route gets a /v1 prefix unless it opts out with
  // @Version(VERSION_NEUTRAL) — used sparingly, only for routes an
  // external system references by a fixed URL it isn't safe to
  // version out from under (see auth.controller.ts's Google OAuth
  // routes, whose callback URL is registered in Google Cloud Console).
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Real auth now exists — the session cookie is httpOnly and cross-origin
  // (frontend and backend are different domains), so `credentials: true`
  // plus a specific origin (not the old wide-open `origin: true`) is
  // required for the browser to send/accept it.
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.use(cookieParser());

  // Ticket attachments now go straight to S3 (see modules/storage/s3.service.ts)
  // and are served from there directly — this backend no longer stores or
  // serves attachment files itself.

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Catches everything a controller/service throws (or a raw Prisma error)
  // and turns it into a clean JSON response instead of a stack trace or a
  // silently hung request. See the filter's own header comment.
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3001);
}

// Last-resort safety nets: something outside a request (a stray promise, a
// timer callback) throwing here would otherwise kill the whole process.
// Log it and keep the server up rather than take every in-flight request
// down with it. This is a deliberate tradeoff for this stage of the
// project — production systems more often prefer to exit and let a process
// manager restart with a clean slate, since an uncaughtException can leave
// in-memory state inconsistent.
const logger = new Logger('Process');
process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled promise rejection',
    reason instanceof Error ? reason.stack : String(reason),
  );
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error.stack);
});

bootstrap();
