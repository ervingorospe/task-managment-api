import { Type } from 'class-transformer';
import { IsArray, IsInt, ValidateNested } from 'class-validator';

class RuleRefDto {
  @IsInt()
  id!: number;
}

export class UpdateRoleRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleRefDto)
  rules!: RuleRefDto[];
}
