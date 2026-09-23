import { IsString, IsTimeZone, MaxLength } from 'class-validator';

export class UpdateOrgTimezoneDto {
  @IsString()
  @MaxLength(250)
  @IsTimeZone()
  timezone!: string;
}
