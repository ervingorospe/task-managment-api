import { IsString } from 'class-validator';

export class UpdateOrgInviteExpirationDto {
  @IsString()
  inviteExpiration!: string;
}
