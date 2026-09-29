import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configValidationSchema } from './config/config-validation.schema';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { RoleModule } from './modules/role/role.module';
import { TagModule } from './modules/tag/tag.module';
import { ProjectModule } from './modules/project/project.module';
import { MemberModule } from './modules/member/member.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { TicketRequestModule } from './modules/ticket-request/ticket-request.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PermissionsModule } from './common/permissions/permissions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
    }),
    // Applies to every route by default (see the APP_GUARD entry below);
    // individual endpoints override this with @Throttle()/@SkipThrottle().
    // 100 req/min per IP is generous enough not to trip over normal app
    // usage (a single page load can easily fire a handful of requests) —
    // this is meant to catch actual abuse, not slow down real usage.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    PrismaModule,
    PermissionsModule,
    OrganizationModule,
    RoleModule,
    TagModule,
    ProjectModule,
    MemberModule,
    TicketModule,
    TicketRequestModule,
    ActivityLogModule,
    UserModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route requires a valid session by default now — see
    // JwtAuthGuard's header comment and the @Public() decorator for the
    // routes that opt out (signup/login/Google OAuth/verify-email).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must run after JwtAuthGuard (registration order = execution order
    // for global guards) so request.user is already populated. Only
    // affects routes carrying @RequirePermissions() — everything else is
    // still just "must be logged in".
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
