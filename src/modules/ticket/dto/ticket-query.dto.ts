import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

function toArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

function toIntArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(Number);
}

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
