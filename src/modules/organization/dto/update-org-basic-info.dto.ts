import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../../common/transformers/empty-to-undefined.transformer';

export class UpdateOrgBasicInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  organizationName?: string;

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
}
