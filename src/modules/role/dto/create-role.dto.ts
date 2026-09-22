import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class RuleRefDto {
  @IsInt()
  id!: number;
}

export class CreateRoleDto {
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
