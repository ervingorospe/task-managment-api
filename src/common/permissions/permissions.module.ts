import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

// Global — PermissionsGuard needs PermissionsService and is itself
// registered app-wide (see app.module.ts), same reasoning as PrismaModule.
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
