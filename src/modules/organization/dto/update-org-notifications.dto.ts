import { IsBoolean } from 'class-validator';

export class UpdateOrgNotificationsDto {
  @IsBoolean()
  sendEmailNotif!: boolean;
}
