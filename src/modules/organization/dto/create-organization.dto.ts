import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

  // These three ceilings mirror OrganizationCapacity's schema defaults
  // (roles: 10, tags: 20, members: 20) — the capacity row itself doesn't
  // exist until after this same request creates it, so there's nothing in
  // the database yet to check the submitted arrays against. A fixed
  // constant here is the one-time equivalent of the runtime
  // assertCapacity() check every later add-role/add-tag/invite-member
  // call goes through once the org (and its capacity row) actually exist.
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OrgRoleDto)
  roles!: OrgRoleDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrgInviteDto)
  invites!: OrgInviteDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrgTagDto)
  tags!: OrgTagDto[];
}
