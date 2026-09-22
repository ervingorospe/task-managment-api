import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(50)
  email!: string;

  @IsInt()
  roleId!: number;

  // No real backend auth/session yet (see auth-provider.tsx), so there's
  // no server-side "current user" to pull this from — the frontend
  // supplies its own currentUser's name, same as how activity log entries
  // get their actor info.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  inviterName?: string;
}
