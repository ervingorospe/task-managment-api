import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toArray } from '../../../common/transformers/to-array.transformer';

export class ActivityLogQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  module?: string[];

  /** actor (user) ids. */
  @IsOptional()
  @Transform(toArray)
  @Type(() => Number)
  @IsArray()
  @IsInt({ each: true })
  author?: number[];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
