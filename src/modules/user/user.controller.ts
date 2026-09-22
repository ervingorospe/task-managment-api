import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';

// 5MB cap — an avatar is a small image, not a general attachment.
// Buffered in memory and uploaded to S3, same as ticket attachments and
// org logos.
const avatarUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // This is the login lookup, and it's unauthenticated (no real auth
  // exists yet — see auth-provider.tsx) — without a tighter limit than
  // the app-wide default, it lets anyone enumerate which emails exist in
  // the system by brute-forcing this endpoint.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('by-email/:email')
  findByEmail(@Param('email') email: string) {
    return this.userService.findByEmailWithMemberships(
      decodeURIComponent(email),
    );
  }

  @Patch(':userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(userId, dto);
  }

  @Post(':userId/avatar')
  @UseInterceptors(avatarUpload)
  uploadAvatar(
    @Param('userId', ParseIntPipe) userId: number,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(userId, file);
  }
}
