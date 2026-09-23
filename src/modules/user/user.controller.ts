import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';

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

  // No Role/Rule governs this — it's not an org action, it's "edit your
  // own account". :userId is only in the path for REST shape; the actual
  // check is that it matches the caller's own session.
  @Patch(':userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertSelf(userId, user);
    return this.userService.update(userId, dto);
  }

  @Post(':userId/avatar')
  @UseInterceptors(avatarUpload)
  uploadAvatar(
    @Param('userId', ParseIntPipe) userId: number,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertSelf(userId, user);
    return this.userService.uploadAvatar(userId, file);
  }

  private assertSelf(userId: number, user: RequestUser) {
    if (userId !== user.id) {
      throw new ForbiddenException('You can only edit your own account.');
    }
  }
}
