import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [StorageModule, EmailModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
