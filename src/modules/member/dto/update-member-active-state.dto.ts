import { IsBoolean } from 'class-validator';

export class UpdateMemberActiveStateDto {
  @IsBoolean()
  isActive!: boolean;
}
