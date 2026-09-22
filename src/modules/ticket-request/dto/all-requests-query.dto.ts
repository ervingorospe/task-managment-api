import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class AllRequestsQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  /** Restricts to requests submitted by this user — used for the
   * ticket.view.included permission tier. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  involvesUserId?: number;
}
