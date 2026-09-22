import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  roleDesc?: string;
}
