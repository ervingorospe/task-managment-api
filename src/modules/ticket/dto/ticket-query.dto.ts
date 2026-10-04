import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toArray } from '../../../common/transformers/to-array.transformer';
import { toIntArray } from '../../../common/transformers/to-int-array.transformer';

export class TicketQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  /** Each entry is either the literal "overdue", the literal "starred",
   * or a tag id. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  filterBy?: string[];

  /** Case-insensitive title search. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  memberIds?: number[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  projectIds?: number[];

  /** Due-date range — matches the frontend's ticket filter panel. */
  @IsOptional()
  @IsString()
  dueDateFrom?: string;

  @IsOptional()
  @IsString()
  dueDateTo?: string;

  /** Restricts to tickets where this user is the client or an assignee —
   * used for the ticket.view.included permission tier. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  involvesUserId?: number;
}
