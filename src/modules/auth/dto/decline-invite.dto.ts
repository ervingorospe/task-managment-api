import { IsString } from 'class-validator';

export class DeclineInviteDto {
  @IsString()
  token!: string;
}
