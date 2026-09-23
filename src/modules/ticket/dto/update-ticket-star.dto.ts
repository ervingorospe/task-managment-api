import { IsBoolean } from 'class-validator';

export class UpdateTicketStarDto {
  @IsBoolean()
  starred!: boolean;
}
