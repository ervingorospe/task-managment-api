import { IsInt } from 'class-validator';

export class UpdateTicketTagDto {
  @IsInt()
  tagId!: number;
}
