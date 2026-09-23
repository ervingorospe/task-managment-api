import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [StorageModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
