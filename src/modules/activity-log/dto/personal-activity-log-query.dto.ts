import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

function toArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

/** No `author` filter — personal activity only ever has one possible
 * actor (the owner themselves), unlike an org's activity log. */
export class PersonalActivityLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  module?: string[];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
