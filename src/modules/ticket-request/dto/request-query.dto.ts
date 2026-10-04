import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toArray } from '../../../common/transformers/to-array.transformer';

export class RequestQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  /** e.g. ["pending"], ["approved","rejected"]. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  filterBy?: string[];
}
