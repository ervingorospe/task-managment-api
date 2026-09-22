import { IsEmail, IsInt, MaxLength } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(50)
  email!: string;

  @IsInt()
  roleId!: number;
}
