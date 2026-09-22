import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class AllTicketsQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  /** Restricts to tickets where this user is the client or an assignee —
   * used for the ticket.view.included permission tier. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  involvesUserId?: number;
}
