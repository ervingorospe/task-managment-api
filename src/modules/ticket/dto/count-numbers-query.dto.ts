import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';
import { toArray } from '../../../common/transformers/to-array.transformer';
import { toIntArray } from '../../../common/transformers/to-int-array.transformer';

export class CountNumbersQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  filterBy?: string[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  projectIds?: number[];

  /** Restricts to tickets where this user is the client or an assignee —
   * used for the ticket.view.included permission tier. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  involvesUserId?: number;
}
