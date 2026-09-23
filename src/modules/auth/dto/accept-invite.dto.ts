import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  token!: string;

  // Only required when accepting creates a brand-new, non-Gmail account —
  // see AuthService.acceptInvite() for exactly when each is needed.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
