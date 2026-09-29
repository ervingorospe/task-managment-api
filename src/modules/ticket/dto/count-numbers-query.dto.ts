import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

function toArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

function toIntArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(Number);
}

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
