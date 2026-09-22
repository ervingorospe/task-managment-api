import { IsInt } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsInt()
  roleId!: number;
}
