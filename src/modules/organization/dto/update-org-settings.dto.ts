import {
  IsBoolean,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from 'class-validator';
import { EmptyToUndefined } from '../../../common/transformers/empty-to-undefined.transformer';

export class UpdateOrgSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  logo?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  @IsTimeZone()
  timezone?: string;

  @IsOptional()
  @IsString()
  inviteExpiration?: string;

  @IsOptional()
  @IsBoolean()
  sendEmailNotif?: boolean;
}
