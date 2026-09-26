import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // Omitted entirely when the account has no password yet (Google-only) —
  // see UserService.changePassword.
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates beyond 72 bytes
  newPassword!: string;

  @IsString()
  confirmPassword!: string;
}
