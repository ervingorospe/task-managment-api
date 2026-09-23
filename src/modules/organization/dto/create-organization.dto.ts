import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EmptyToUndefined } from '../../../common/transformers/empty-to-undefined.transformer';

class RuleRefDto {
  @IsInt()
  id!: number;
}

class OrgRoleDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsBoolean()
  isDefault!: boolean;

  @IsString()
  @MaxLength(50)
  roleName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  roleDesc?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleRefDto)
  rules!: RuleRefDto[];
}

class OrgInviteDto {
  @IsEmail()
  @MaxLength(50)
  email!: string;

  @IsInt()
  roleId!: number;
}

class OrgTagDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  @MaxLength(50)
  tagName!: string;

  @IsString()
  color!: string;

  @IsBoolean()
  isDefault!: boolean;
}

export class CreateOrganizationDto {
  @IsString()
  @MaxLength(50)
  organizationName!: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsEmail()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  organizationDesc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  logo?: string;

  @IsString()
  @MaxLength(250)
  @IsTimeZone()
  timezone!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgRoleDto)
  roles!: OrgRoleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgInviteDto)
  invites!: OrgInviteDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgTagDto)
  tags!: OrgTagDto[];
}
