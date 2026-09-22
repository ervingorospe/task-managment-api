import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

@Module({
  imports: [EmailModule],
  controllers: [MemberController],
  providers: [MemberService],
})
export class MemberModule {}
