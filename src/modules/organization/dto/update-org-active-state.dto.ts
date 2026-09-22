import { IsBoolean } from 'class-validator';

export class UpdateOrgActiveStateDto {
  @IsBoolean()
  isActive!: boolean;
}
