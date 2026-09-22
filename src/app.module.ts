import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { RoleModule } from './modules/role/role.module';
import { TagModule } from './modules/tag/tag.module';
import { MemberModule } from './modules/member/member.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { TicketRequestModule } from './modules/ticket-request/ticket-request.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { UserModule } from './modules/user/user.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    OrganizationModule,
    RoleModule,
    TagModule,
    MemberModule,
    TicketModule,
    TicketRequestModule,
    ActivityLogModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
