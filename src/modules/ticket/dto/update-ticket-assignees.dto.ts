import { Type } from 'class-transformer';
import { IsArray, IsInt } from 'class-validator';

export class UpdateTicketAssigneesDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  assigneeIds!: number[];
}
